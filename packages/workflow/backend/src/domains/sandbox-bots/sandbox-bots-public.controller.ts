import {
  BadRequestException,
  Controller,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Public } from '../auth/auth/public.decorator.js';
import { SandboxBotsService } from './sandbox-bots.service.js';

interface IRawBodyRequest {
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly rawBody?: Uint8Array;
  readonly ip?: string;
}

const DROPPED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade']);

/**
 * Public webhook of the shared test bots, `POST /webhooks/sandbox-bots/:vendor` — two path segments after `/webhooks`, so
 * it never collides with the gateway's `/webhooks/:vendor/:projectId/:credentialId/:env` route (four or five), and it falls
 * under the same `webhooks` rate-limit family. The adapter's own handler verifies the derived secret.
 */
@Controller('webhooks/sandbox-bots')
export class SandboxBotsWebhookController {
  private readonly bots: SandboxBotsService;

  constructor(@Inject(SandboxBotsService) bots: SandboxBotsService) {
    this.bots = bots;
  }

  @Public()
  @Post(':vendor')
  async receive(@Param('vendor') vendor: string, @Req() req: IRawBodyRequest): Promise<{ status: number }> {
    const handler = this.bots.findWebhookHandler(vendor);
    if (!handler) throw new NotFoundException(`No sandbox webhook registered for "${vendor}"`);
    if (!req.rawBody) throw new BadRequestException('Expected a JSON body');
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      const lower = name.toLowerCase();
      if (!value || DROPPED_HEADERS.has(lower)) continue;
      for (const item of typeof value === 'string' ? [value] : value) headers.append(lower, item);
    }
    const request = new Request('http://internal.invalid/', {
      method: 'POST',
      body: req.rawBody as BodyInit,
      headers,
    });
    const response = await handler(request, { ip: req.ip });
    if (response.status >= 400) throw new HttpException({ status: response.status }, response.status);
    return { status: response.status };
  }
}
