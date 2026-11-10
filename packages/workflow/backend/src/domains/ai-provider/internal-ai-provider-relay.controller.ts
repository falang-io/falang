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
import type { Request, Response } from 'express';
import { Public } from '../auth/auth/public.decorator.js';
import { aiProviderRelayError } from './ai-provider-relay-errors.js';
import { AiProviderRelayGuard } from './ai-provider-relay.guard.js';
import { AiProviderRelayService, type TAiProviderEnv } from './ai-provider-relay.service.js';

type TRawRequest = Request & { rawBody?: Buffer };

const parseEnv = (env: string): TAiProviderEnv => {
  if (env !== 'dev' && env !== 'prod') throw new NotFoundException(`Unknown environment "${env}"`);
  return env;
};

/** Image generation and transcription are billed per call — not in v1 (ADR 0081 (private) decision 7). */
const notSupported = (what: string): never => {
  throw aiProviderRelayError(
    HttpStatus.BAD_REQUEST,
    'not_supported_by_built_in_provider',
    `${what} is not available through the built-in AI provider yet — use your own OpenAI-compatible key for this node`,
  );
};

/**
 * `/internal/ai-provider/:projectId/:env/*` — the `baseUrl` a runner pod gets for an OpenAI instance on the built-in
 * AI provider (ADR 0081 (private)). Internal port only (`portSplitMiddleware`), authenticated by the project token
 * (`AiProviderRelayGuard`); JSON bodies up to 30 MB (`body-limits.ts`).
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
    const body: unknown = req.body;
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(body ?? null));
    const result = await this.relay.chatCompletions(projectId, parsedEnv, raw, body);
    res.status(result.status);
    if (result.contentType) res.type(result.contentType);
    res.send(Buffer.from(result.body));
  }

  @Post(':projectId/:env/images/generations')
  images(@Param('env') env: string): never {
    parseEnv(env);
    return notSupported('Image generation');
  }

  @Post(':projectId/:env/audio/transcriptions')
  transcriptions(@Param('env') env: string): never {
    parseEnv(env);
    return notSupported('Audio transcription');
  }

  @Get(':projectId/:env/models')
  models(@Param('env') env: string): ReturnType<AiProviderRelayService['listModels']> {
    parseEnv(env);
    return this.relay.listModels();
  }
}
