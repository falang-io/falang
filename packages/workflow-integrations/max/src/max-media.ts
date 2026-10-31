import type { IIntegrationBackendContext } from '@falang/workflow-integrations-common';
import type { IMaxRawAttachment, IMaxRawMessage } from './max-message-mapper.js';

/** Return type of `IIntegrationBackendContext.uploadFile` — a `files/File` reference, kept opaque here (same as Telegram's `telegram-media.ts`). */
type TUploadedFile = Awaited<ReturnType<IIntegrationBackendContext['uploadFile']>>;

const MAX_INGRESS_CREATED_BY = 'ingress:max';

export interface IIncomingMediaDeps {
  readonly botToken: string;
  /** e.g. `https://platform-api.max.ru`, or the e2e mocks' `<mocksUrl>/max` — only used for `GET /videos/{token}`. */
  readonly apiBaseUrl: string;
  readonly uploadFile: IIntegrationBackendContext['uploadFile'];
}

/** One resolved media field — `undefined` when the message carries no media of this kind, `null` when it does but resolution failed. */
export interface IResolvedMaxMedia {
  readonly photo?: TUploadedFile | null;
  readonly document?: TUploadedFile | null;
  readonly audio?: TUploadedFile | null;
  readonly video?: TUploadedFile | null;
}

interface IMaxVideoDetails {
  readonly urls?: Readonly<Record<string, string | null | undefined>> | null;
}

/** Best quality first — the keys of Max's `VideoUrls` that are plain MP4 files (HLS is a playlist, not a file). */
const VIDEO_URL_KEYS = ['mp4_1080', 'mp4_720', 'mp4_480', 'mp4_360', 'mp4_240', 'mp4_144'] as const;

const warn = (message: string): void => {
  // No injectable logger reaches a vendor package's `registerBackend` (see `telegram-media.ts`) — a single
  // unresolvable attachment must never fail the whole incoming update.
  // oxlint-disable-next-line no-console -- deliberate, see the comment above.
  console.warn(`[max] ${message}`);
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const bestVideoUrl = (details: IMaxVideoDetails): string | null => {
  for (const key of VIDEO_URL_KEYS) {
    const url = details.urls?.[key];
    if (url) return url;
  }
  return null;
};

/** `GET /videos/{token}` -> the best direct MP4 URL; a video attachment's own `payload.url` is not guaranteed to be a file. */
const resolveVideoUrl = async (attachment: IMaxRawAttachment, deps: IIncomingMediaDeps): Promise<string | null> => {
  const token = attachment.payload?.token;
  if (token) {
    try {
      const response = await fetch(`${deps.apiBaseUrl}/videos/${encodeURIComponent(token)}`, {
        headers: { Authorization: deps.botToken },
      });
      if (response.ok) {
        const url = bestVideoUrl((await response.json()) as IMaxVideoDetails);
        if (url) return url;
      } else {
        warn(`video details failed for ${token}: ${response.status}`);
      }
    } catch (error) {
      warn(`video details threw for ${token}: ${describeError(error)}`);
    }
  }
  return attachment.payload?.url ?? null;
};

/** Content type from the download response, else a kind-specific default. */
const mimeOf = (response: Response, fallback: string): string =>
  response.headers.get('content-type')?.split(';')[0]?.trim() || fallback;

const extensionFromMime = (mime: string): string => mime.split('/')[1]?.split('+')[0] || 'bin';

interface IResolveDefaults {
  readonly kind: string;
  readonly mime: string;
  readonly name?: string;
}

/** Downloads one URL into a `files/File`. Never throws: any failure is logged and resolves to `null`. */
const downloadToFile = async (
  url: string | null | undefined,
  deps: IIncomingMediaDeps,
  defaults: IResolveDefaults,
  uniqueId: string,
): Promise<TUploadedFile | null> => {
  if (!url) {
    warn(`${defaults.kind} attachment has no URL — skipped`);
    return null;
  }
  try {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      warn(`failed to download ${defaults.kind}: ${response.status}`);
      return null;
    }
    const mime = mimeOf(response, defaults.mime);
    const name = defaults.name ?? `${defaults.kind}-${uniqueId}.${extensionFromMime(mime)}`;
    return await deps.uploadFile(response.body, { name, mime, createdBy: MAX_INGRESS_CREATED_BY });
  } catch (error) {
    warn(`download/upload failed for ${defaults.kind}: ${describeError(error)}`);
    return null;
  }
};

const firstOfType = (attachments: readonly IMaxRawAttachment[], type: string): IMaxRawAttachment | undefined =>
  attachments.find((attachment) => attachment.type === type);

/**
 * Resolves the message's media attachments into `files/File`s eagerly, at ingress (the same decision as Telegram,
 * ADR 0038 (private) §5): `image` -> `photo`, `file` -> `document`, `audio` -> `audio` (Max voice messages arrive as
 * audio), `video` -> `video`. Only the first attachment of each kind is kept. Max hands direct download URLs in the
 * update itself, so there is no `getFile` round-trip; a video goes through `GET /videos/{token}` for an MP4 URL.
 */
export const resolveIncomingMedia = async (
  raw: IMaxRawMessage,
  deps: IIncomingMediaDeps,
): Promise<IResolvedMaxMedia> => {
  const attachments = raw.body?.attachments ?? [];
  if (attachments.length === 0) return {};
  const uniqueId = raw.body?.mid ?? String(raw.timestamp);
  const result: {
    photo?: TUploadedFile | null;
    document?: TUploadedFile | null;
    audio?: TUploadedFile | null;
    video?: TUploadedFile | null;
  } = {};

  const image = firstOfType(attachments, 'image');
  if (image)
    result.photo = await downloadToFile(image.payload?.url, deps, { kind: 'photo', mime: 'image/jpeg' }, uniqueId);

  const file = firstOfType(attachments, 'file');
  if (file) {
    result.document = await downloadToFile(
      file.payload?.url,
      deps,
      { kind: 'document', mime: 'application/octet-stream', ...(file.filename ? { name: file.filename } : {}) },
      uniqueId,
    );
  }

  const audio = firstOfType(attachments, 'audio');
  if (audio)
    result.audio = await downloadToFile(audio.payload?.url, deps, { kind: 'audio', mime: 'audio/mpeg' }, uniqueId);

  const video = firstOfType(attachments, 'video');
  if (video) {
    result.video = await downloadToFile(
      await resolveVideoUrl(video, deps),
      deps,
      { kind: 'video', mime: 'video/mp4' },
      uniqueId,
    );
  }
  return result;
};
