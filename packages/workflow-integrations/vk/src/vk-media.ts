import type { IIntegrationBackendContext } from '@falang/workflow-integrations-common';
import type { IVkRawAttachment, IVkRawMessage, IVkRawPhotoSize } from './vk-message-mapper.js';

/** Return type of `IIntegrationBackendContext.uploadFile` — a `files/File` reference, kept opaque here (same as MAX's `max-media.ts`). */
type TUploadedFile = Awaited<ReturnType<IIntegrationBackendContext['uploadFile']>>;

const VK_INGRESS_CREATED_BY = 'ingress:vk';

export interface IIncomingMediaDeps {
  readonly uploadFile: IIntegrationBackendContext['uploadFile'];
}

/** One resolved media field — `undefined` when the message carries none of this kind, `null` when it does but resolution failed. */
export interface IResolvedVkMedia {
  readonly photo?: TUploadedFile | null;
  readonly document?: TUploadedFile | null;
  readonly voice?: TUploadedFile | null;
}

const warn = (message: string): void => {
  // No injectable logger reaches a vendor package's `registerBackend`; one unresolvable attachment must never fail the update.
  // oxlint-disable-next-line no-console -- deliberate, see the comment above.
  console.warn(`[vk] ${message}`);
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const mimeOf = (response: Response, fallback: string): string =>
  response.headers.get('content-type')?.split(';')[0]?.trim() || fallback;

const extensionFromMime = (mime: string): string => mime.split('/')[1]?.split('+')[0] || 'bin';

/** The largest size by area (`orig_photo` wins when VK sends it). */
export const bestPhotoUrl = (photo: NonNullable<IVkRawAttachment['photo']>): string | null => {
  if (photo.orig_photo?.url) return photo.orig_photo.url;
  let best: IVkRawPhotoSize | null = null;
  for (const size of photo.sizes ?? []) {
    if (!size.url) continue;
    const area = (size.width ?? 0) * (size.height ?? 0);
    if (!best || area > (best.width ?? 0) * (best.height ?? 0)) best = size;
  }
  return best?.url ?? null;
};

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
    return await deps.uploadFile(response.body, { name, mime, createdBy: VK_INGRESS_CREATED_BY });
  } catch (error) {
    warn(`download/upload failed for ${defaults.kind}: ${describeError(error)}`);
    return null;
  }
};

const firstOfType = (attachments: readonly IVkRawAttachment[], type: string): IVkRawAttachment | undefined =>
  attachments.find((attachment) => attachment.type === type);

const docName = (doc: NonNullable<IVkRawAttachment['doc']>): string | undefined => {
  if (!doc.title) return;
  return doc.ext && !doc.title.toLowerCase().endsWith(`.${doc.ext.toLowerCase()}`)
    ? `${doc.title}.${doc.ext}`
    : doc.title;
};

/**
 * Resolves the message's media into `files/File`s eagerly, at ingress (ADR 0038 (private) §5): `photo` -> `photo` (the
 * largest size), `doc` -> `document`, `audio_message` -> `voice` (`link_mp3`, else `link_ogg`). Only the first of each
 * kind is kept; a video has no direct URL and is not resolved. VK hands direct URLs in the update, no extra call.
 */
export const resolveIncomingMedia = async (raw: IVkRawMessage, deps: IIncomingMediaDeps): Promise<IResolvedVkMedia> => {
  const attachments = raw.attachments ?? [];
  if (attachments.length === 0) return {};
  const uniqueId = String(raw.id ?? raw.date ?? '0');
  const result: { photo?: TUploadedFile | null; document?: TUploadedFile | null; voice?: TUploadedFile | null } = {};

  const photo = firstOfType(attachments, 'photo')?.photo;
  if (photo) {
    result.photo = await downloadToFile(bestPhotoUrl(photo), deps, { kind: 'photo', mime: 'image/jpeg' }, uniqueId);
  }

  const doc = firstOfType(attachments, 'doc')?.doc;
  if (doc) {
    const name = docName(doc);
    result.document = await downloadToFile(
      doc.url,
      deps,
      { kind: 'document', mime: 'application/octet-stream', ...(name ? { name } : {}) },
      uniqueId,
    );
  }

  const voice = firstOfType(attachments, 'audio_message')?.audio_message;
  if (voice) {
    result.voice = await downloadToFile(
      voice.link_mp3 ?? voice.link_ogg,
      deps,
      { kind: 'voice', mime: voice.link_mp3 ? 'audio/mpeg' : 'audio/ogg' },
      uniqueId,
    );
  }
  return result;
};
