import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

/**
 * The uploaded file's byte stream off a raw-body POST (`internal-files.controller.ts`/
 * `project-files.controller.ts`) — the body is *never* multipart or JSON-wrapped, just the file's
 * bytes with `content-type` set to its mime.
 *
 * Nest registers its default `json`/`urlencoded` body-parser middleware globally regardless of any
 * one route's needs, and each only actually consumes the request stream when the incoming
 * `content-type` matches its own type filter (`application/json` / `application/x-www-form-
 * urlencoded`) — every real file mime this endpoint expects (`image/*`, `application/octet-stream`,
 * …) sails past both untouched, leaving `req` itself as a live, unconsumed `Readable`. The one real
 * edge case is a file whose own mime genuinely *is* `application/json` (e.g. the `files` vendor's
 * `files-from-text` action, `mime: 'application/json'`) — there, the body-parser middleware already
 * drained `req` before this handler ever runs. `main.ts` bootstraps with `rawBody: true`
 * specifically so that case still recovers the exact original bytes via `req.rawBody` (a `Buffer`
 * populated by body-parser's own `verify` hook) rather than losing them — see
 * `@nestjs/platform-express`'s `getBodyParserOptions`. Confirmed empirically (not just reasoned
 * about) by `files.e2e.test.ts`'s "application/json content-type" case.
 */
export const rawUploadBody = (req: Request & { rawBody?: Buffer }): Readable =>
  Buffer.isBuffer(req.rawBody) ? Readable.from(req.rawBody) : req;

// Falls off the end (an implicit, literal-`undefined`-free "no value") when `value` is absent or
// an empty array — oxlint's `no-undefined` disallows spelling out the token itself.
const headerValue = (value: string | readonly string[] | undefined): string | undefined => {
  if (typeof value === 'string') return value;
  if (value && value.length > 0) return value[0];
};

export const requireFileName = (value: string | readonly string[] | undefined): string => {
  const raw = headerValue(value);
  if (!raw) throw new BadRequestException('Missing "x-file-name" header');
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new BadRequestException('Invalid "x-file-name" header');
  }
};

export const parseTtlSeconds = (value: string | readonly string[] | undefined): number | undefined => {
  const raw = headerValue(value);
  if (typeof raw !== 'string') return;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new BadRequestException('"x-file-ttl-seconds" must be a positive integer');
  }
  return parsed;
};

export const parseWorkflowEnv = (value: string | readonly string[] | undefined): 'dev' | 'prod' | undefined => {
  const raw = headerValue(value);
  if (raw === 'dev' || raw === 'prod') return raw;
};

export const parseCreatedBy = (value: string | readonly string[] | undefined, fallback: string): string =>
  headerValue(value) ?? fallback;

export const contentTypeOf = (value: string | readonly string[] | undefined): string => {
  const raw = headerValue(value);
  return raw && raw.length > 0 ? raw : 'application/octet-stream';
};
