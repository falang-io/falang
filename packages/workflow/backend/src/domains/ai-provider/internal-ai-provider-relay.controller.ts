import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AI_PROVIDER_BODY_LIMIT_BYTES } from '../../http-hardening/body-limits.js';
import { Public } from '../auth/auth/public.decorator.js';
import { multipartBoundary } from './ai-provider-multipart.js';
import { readRawBody, type TRawRequest } from './ai-provider-raw-body.js';
import { aiProviderRelayError } from './ai-provider-relay-errors.js';
import { AiProviderRelayGuard } from './ai-provider-relay.guard.js';
import {
  AiProviderRelayService,
  type IAiProviderRelayResponse,
  type TAiProviderEnv,
} from './ai-provider-relay.service.js';

const parseEnv = (env: string): TAiProviderEnv => {
  if (env !== 'dev' && env !== 'prod') throw new NotFoundException(`Unknown environment "${env}"`);
  return env;
};

const send = (res: Response, result: IAiProviderRelayResponse): void => {
  res.status(result.status);
  if (result.contentType) res.type(result.contentType);
  res.send(Buffer.from(result.body));
};

const jsonBody = (req: TRawRequest): { raw: Buffer; body: unknown } => {
  const body: unknown = req.body;
  return { raw: req.rawBody ?? Buffer.from(JSON.stringify(body ?? null)), body };
};

/**
 * `/internal/ai-provider/:projectId/:env/*` — the `baseUrl` a runner pod gets for an OpenAI instance on the built-in
 * AI provider (ADR 0081 (private)). Internal port only (`portSplitMiddleware`), authenticated by the project token
 * (`AiProviderRelayGuard`); JSON bodies up to 30 MB (`body-limits.ts`), the multipart transcription body likewise (read
 * here, `readRawBody`).
 */
@Public()
@UseGuards(AiProviderRelayGuard)
@Controller('internal/ai-provider')
export class InternalAiProviderRelayController {
  private readonly relay: AiProviderRelayService;

  constructor(@Inject(AiProviderRelayService) relay: AiProviderRelayService) {
    this.relay = relay;
  }

  @Post(':projectId/:env/chat/completions')
  async chatCompletions(
    @Param('projectId') projectId: string,
    @Param('env') env: string,
    @Req() req: TRawRequest,
    @Res() res: Response,
  ): Promise<void> {
    const parsedEnv = parseEnv(env);
    const { raw, body } = jsonBody(req);
    send(res, await this.relay.chatCompletions(projectId, parsedEnv, raw, body));
  }

  @Post(':projectId/:env/images/generations')
  async images(
    @Param('projectId') projectId: string,
    @Param('env') env: string,
    @Req() req: TRawRequest,
    @Res() res: Response,
  ): Promise<void> {
    const parsedEnv = parseEnv(env);
    const { raw, body } = jsonBody(req);
    send(res, await this.relay.imagesGenerations(projectId, parsedEnv, raw, body));
  }

  /** `multipart/form-data` (file + `model` + …): the bytes and boundary are forwarded as they came. */
  @Post(':projectId/:env/audio/transcriptions')
  async transcriptions(
    @Param('projectId') projectId: string,
    @Param('env') env: string,
    @Req() req: TRawRequest,
    @Res() res: Response,
  ): Promise<void> {
    const parsedEnv = parseEnv(env);
    const contentType = req.headers['content-type'] ?? '';
    const boundary = multipartBoundary(contentType);
    if (!boundary) {
      throw aiProviderRelayError(
        HttpStatus.BAD_REQUEST,
        'invalid_request',
        'Audio transcription expects a multipart/form-data body',
      );
    }
    const raw = await readRawBody(req, AI_PROVIDER_BODY_LIMIT_BYTES);
    send(res, await this.relay.audioTranscriptions(projectId, parsedEnv, raw, contentType, boundary));
  }

  @Get(':projectId/:env/models')
  models(@Param('env') env: string): ReturnType<AiProviderRelayService['listModels']> {
    parseEnv(env);
    return this.relay.listModels();
  }
}
