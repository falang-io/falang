// oxlint-disable init-declarations, max-classes-per-file, no-undefined -- a tiny body-size error class next to the controller; optional body is genuinely undefined.
import { All, Controller, Inject, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/auth/public.decorator.js';
import { SandboxRelayService } from './sandbox-relay.service.js';

/** Largest relayed body (Telegram's file limit is 50 MB). */
const MAX_BODY_BYTES = 55 * 1024 * 1024;
const PATH_PATTERN = /^\/+internal\/sandbox-bots\/[^/]+\/[^/]+(\/.*)?$/i;

type TRawRequest = Request & { rawBody?: Buffer };

class BodyTooLargeError extends Error {}

/** The request body as exact bytes: Nest's captured `rawBody` for JSON/urlencoded, else the untouched stream (multipart). */
const readBody = async (req: TRawRequest): Promise<Uint8Array | undefined> => {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  if (req.rawBody) return req.rawBody;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
    chunks.push(buffer);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
};

/**
 * `/internal/sandbox-bots/:vendor/:projectId/*` — the base URL a sandbox-mode runner pod is given instead of the messenger
 * API (ADR 0073 (private)). Served on the internal port only (`portSplitMiddleware`). Authentication is the relay token the
 * pod put into the vendor URL/headers, verified by `SandboxRelayService` after the adapter extracted it.
 */
@Public()
@Controller('internal/sandbox-bots')
export class InternalSandboxRelayController {
  private readonly relay: SandboxRelayService;

  constructor(@Inject(SandboxRelayService) relay: SandboxRelayService) {
    this.relay = relay;
  }

  @All(':vendor/:projectId/*splat')
  async handle(
    @Param('vendor') vendor: string,
    @Param('projectId') projectId: string,
    @Req() req: TRawRequest,
    @Res() res: Response,
  ): Promise<void> {
    const queryIndex = req.originalUrl.indexOf('?');
    const pathname = queryIndex === -1 ? req.originalUrl : req.originalUrl.slice(0, queryIndex);
    const search = queryIndex === -1 ? '' : req.originalUrl.slice(queryIndex);
    const path = PATH_PATTERN.exec(pathname)?.[1] ?? '/';
    let body: Uint8Array | undefined;
    try {
      body = await readBody(req);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        res.status(413).json({ ok: false, error_code: 413, description: 'Request Entity Too Large' });
        return;
      }
      throw error;
    }
    const result = await this.relay.relay(vendor, projectId, {
      method: req.method,
      headers: req.headers,
      path,
      search,
      body,
    });
    res.status(result.status);
    if (result.contentType) res.type(result.contentType);
    res.send(Buffer.from(result.body));
  }
}
