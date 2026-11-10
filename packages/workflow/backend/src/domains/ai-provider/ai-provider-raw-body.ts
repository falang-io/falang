import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';
import { HttpStatus, type HttpException } from '@nestjs/common';
import type { Request } from 'express';
import { aiProviderRelayError } from './ai-provider-relay-errors.js';

/** An Express request; `rawBody` is set when a JSON/urlencoded parser already read the body (`rawBody: true`). */
export type TRawRequest = Request & { rawBody?: Buffer };

/** What {@link readRawBody} needs of a request: the body stream, its headers and a body a parser already captured. */
export type TRawBodySource = Readable & { readonly headers: IncomingHttpHeaders; readonly rawBody?: Buffer };

const tooLarge = (limit: number): HttpException =>
  aiProviderRelayError(
    HttpStatus.PAYLOAD_TOO_LARGE,
    'request_too_large',
    `The request body exceeds ${Math.round(limit / (1024 * 1024))} MB`,
  );

/**
 * The raw bytes of a body no parser consumed (`multipart/form-data` — only JSON/urlencoded parsers run before the
 * routes), at most `limit` bytes: 413 `request_too_large` beyond (a declared `Content-Length` over the limit is refused
 * before reading; otherwise the rest is drained without being kept, so the 413 can still be sent).
 */
export const readRawBody = (req: TRawBodySource, limit: number): Promise<Buffer> => {
  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody.length > limit ? Promise.reject(tooLarge(limit)) : Promise.resolve(req.rawBody);
  }
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) return Promise.reject(tooLarge(limit));
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let over = false;
    req.on('data', (chunk: Buffer) => {
      if (over) return;
      size += chunk.length;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => (over ? reject(tooLarge(limit)) : resolve(Buffer.concat(chunks, size))));
    req.on('error', reject);
  });
};
