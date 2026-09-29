import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Response } from 'express';

export type TFileDisposition = 'inline' | 'attachment';

const INLINE_MIME_PREFIXES = ['image/', 'audio/', 'video/'];

/** `image/*`, `audio/*`, `video/*`, and `application/pdf` render inline on the public route (§ "Public route"); everything else, and every project/internal download, is a plain attachment. */
export const inlineDispositionFor = (mime: string): TFileDisposition =>
  INLINE_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) || mime === 'application/pdf' ? 'inline' : 'attachment';

export interface IStreamFileResponseOptions {
  readonly body: Readable;
  readonly contentType: string;
  readonly contentLength?: number;
  readonly name: string;
  readonly disposition: TFileDisposition;
  readonly cacheControl?: string;
}

/** Writes headers and pipes `body` to `res` — used by all three download routes (internal/public/project). `@Res({ passthrough: false })` callers only: Nest never touches `res` afterward. */
export const streamFileResponse = async (res: Response, opts: IStreamFileResponseOptions): Promise<void> => {
  res.status(200);
  res.setHeader('content-type', opts.contentType);
  if (typeof opts.contentLength === 'number') res.setHeader('content-length', String(opts.contentLength));
  res.setHeader('content-disposition', `${opts.disposition}; filename*=UTF-8''${encodeURIComponent(opts.name)}`);
  if (opts.cacheControl) res.setHeader('cache-control', opts.cacheControl);
  await pipeline(opts.body, res);
};
