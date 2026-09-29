import type { IIntegrationBackendContext } from '@falang/workflow-integrations-common';
import type { ITelegramRawMessage, ITelegramRawPhotoSize } from './telegram-message-mapper.js';

/** Return type of `IIntegrationBackendContext.uploadFile` — a `files/File` reference, kept opaque here (this package never imports `@falang/workflow-integrations-files`). */
type TUploadedFile = Awaited<ReturnType<IIntegrationBackendContext['uploadFile']>>;

/** Bot API caps `getFile` at this size (ADR 0038 (private) §5) — checked against the raw message's own `file_size` up front, before ever calling `getFile`, to skip the round-trip for a known-oversized file. */
const TELEGRAM_MAX_GET_FILE_BYTES = 20 * 1024 * 1024;

const TELEGRAM_INGRESS_CREATED_BY = 'ingress:telegram';

export interface IIncomingMediaDeps {
  readonly botToken: string;
  /** e.g. `https://api.telegram.org`, or the e2e mocks' `<mocksUrl>/telegram` — see `telegram.integration.ts`'s `TELEGRAM_API_BASE_URL`. */
  readonly apiBaseUrl: string;
  readonly uploadFile: IIntegrationBackendContext['uploadFile'];
}

/** One resolved media field — `undefined` when the raw message carries no media of this kind at all, `null` when it does but resolution failed (oversized, `getFile` error, download error) — see ADR 0038 (private) §5. */
export interface IResolvedTelegramMedia {
  readonly photo?: TUploadedFile | null;
  readonly document?: TUploadedFile | null;
  readonly voice?: TUploadedFile | null;
  readonly audio?: TUploadedFile | null;
  readonly video?: TUploadedFile | null;
}

interface ITelegramFileRef {
  readonly file_id: string;
  readonly file_unique_id: string;
  readonly file_size?: number;
  readonly mime_type?: string;
  readonly file_name?: string;
}

const warn = (message: string): void => {
  // No injectable logger reaches a vendor package's `registerBackend` (same constraint
  // `schedule-backend.ts`'s `logSkippedDocument` documents) — a single unresolvable attachment must
  // never fail the whole incoming update.
  // oxlint-disable-next-line no-console -- deliberate, see the comment above.
  console.warn(`[telegram] ${message}`);
};

/** `image/svg+xml` -> `svg`, `audio/ogg` -> `ogg`, unknown/absent -> `bin` — only used for the fallback filename when Telegram doesn't hand us one (photos never have `file_name`). */
const extensionFromMime = (mime: string): string => {
  const subtype = mime.split('/')[1]?.split(';')[0]?.split('+')[0];
  return subtype || 'bin';
};

/** Telegram sends the same photo at several resolutions (`PhotoSize[]`, smallest first) — the largest one is the closest match to what the user actually sent. */
const largestPhoto = (sizes: readonly ITelegramRawPhotoSize[]): ITelegramRawPhotoSize => {
  let largest = sizes[0];
  for (const candidate of sizes) if (candidate.width > largest.width) largest = candidate;
  return largest;
};

/** `getFile` -> Telegram's `file_path` for this `file_id`, or `null` (logged) on any failure. */
const getTelegramFilePath = async (
  ref: ITelegramFileRef,
  kind: string,
  deps: IIncomingMediaDeps,
): Promise<string | null> => {
  try {
    const response = await fetch(`${deps.apiBaseUrl}/bot${deps.botToken}/getFile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: ref.file_id }),
    });
    if (!response.ok) {
      warn(`getFile failed for ${kind} ${ref.file_id}: ${response.status} ${await response.text()}`);
      return null;
    }
    const data = (await response.json()) as { readonly result?: { readonly file_path?: string } };
    if (!data.result?.file_path) {
      warn(`getFile returned no file_path for ${kind} ${ref.file_id}`);
      return null;
    }
    return data.result.file_path;
  } catch (error) {
    warn(`getFile threw for ${kind} ${ref.file_id}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

/**
 * `ref.mime_type` when Telegram's raw shape actually carries one (`document`/`audio`/`video`); for
 * `photo`/`voice`, which never do (`ITelegramRawPhotoSize`/`ITelegramRawVoice`'s own `mime_type` is
 * always absent in practice — Bot API doesn't send it for either), a kind-specific fallback per
 * Telegram's own documented, fixed encoding rather than the generic `application/octet-stream`:
 * every photo is server-side re-encoded to JPEG, every voice message to Ogg/Opus.
 */
interface IResolveOneFileDefaults {
  readonly mime?: string;
  /** Overrides `extensionFromMime(mime)` — needed for `photo` (`image/jpeg` -> `jpg`, not the `jpeg` `extensionFromMime` would derive). */
  readonly extension?: string;
}

/**
 * `getFile` -> `${apiBaseUrl}/file/bot<token>/<file_path>` -> `uploadFile`. Never throws: any failure
 * (oversized, `getFile` non-ok, no `file_path`, download non-ok/no body, `uploadFile` rejecting) is
 * logged and resolves to `null` instead — one bad attachment must not drop the whole update.
 */
const resolveOneFile = async (
  ref: ITelegramFileRef,
  kind: string,
  deps: IIncomingMediaDeps,
  defaults: IResolveOneFileDefaults = {},
): Promise<TUploadedFile | null> => {
  if (typeof ref.file_size === 'number' && ref.file_size > TELEGRAM_MAX_GET_FILE_BYTES) {
    warn(`${kind} ${ref.file_id} is ${ref.file_size} bytes, over Telegram's 20 MB getFile limit — skipped`);
    return null;
  }

  const filePath = await getTelegramFilePath(ref, kind, deps);
  if (!filePath) return null;

  try {
    const downloadResponse = await fetch(`${deps.apiBaseUrl}/file/bot${deps.botToken}/${filePath}`);
    if (!downloadResponse.ok || !downloadResponse.body) {
      warn(`failed to download ${kind} ${ref.file_id}: ${downloadResponse.status}`);
      return null;
    }
    const mime = ref.mime_type ?? defaults.mime ?? 'application/octet-stream';
    const extension = defaults.extension ?? extensionFromMime(mime);
    const name = ref.file_name ?? `${kind}-${ref.file_unique_id}.${extension}`;
    return await deps.uploadFile(downloadResponse.body, { name, mime, createdBy: TELEGRAM_INGRESS_CREATED_BY });
  } catch (error) {
    warn(
      `download/upload failed for ${kind} ${ref.file_id}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
};

/**
 * Resolves every media reference on an incoming Telegram message into a `files/File` (eagerly, at
 * ingress — ADR 0038 (private) §5's "Incoming Telegram media is stored eagerly" decision), so the
 * compiled workflow just reads `message.photo`/`.document`/`.voice`/`.audio`/`.video` and gets a
 * ready-to-use `File` (or `null` if it couldn't be resolved) — no extra node required. Telegram sends
 * at most one media kind per message, so these five checks are exclusive in practice, not a hot loop.
 */
export const resolveIncomingMedia = async (
  raw: ITelegramRawMessage,
  deps: IIncomingMediaDeps,
): Promise<IResolvedTelegramMedia> => {
  const result: {
    photo?: TUploadedFile | null;
    document?: TUploadedFile | null;
    voice?: TUploadedFile | null;
    audio?: TUploadedFile | null;
    video?: TUploadedFile | null;
  } = {};
  if (raw.photo && raw.photo.length > 0) {
    result.photo = await resolveOneFile(largestPhoto(raw.photo), 'photo', deps, {
      mime: 'image/jpeg',
      extension: 'jpg',
    });
  }
  if (raw.document) result.document = await resolveOneFile(raw.document, 'document', deps);
  if (raw.voice) result.voice = await resolveOneFile(raw.voice, 'voice', deps, { mime: 'audio/ogg' });
  if (raw.audio) result.audio = await resolveOneFile(raw.audio, 'audio', deps);
  if (raw.video) result.video = await resolveOneFile(raw.video, 'video', deps);
  return result;
};
