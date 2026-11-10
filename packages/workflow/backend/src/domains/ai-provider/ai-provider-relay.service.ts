import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TAiProviderModelKind } from '../admin/app-settings/ai-provider-models.js';
import { AiProviderSettingsService } from '../admin/app-settings/ai-provider-settings.service.js';
import { aiProviderCallsTotal } from '../metrics/metrics.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { AiProviderOwnerLimiter } from './ai-provider-owner-limiter.js';
import { aiProviderRelayError } from './ai-provider-relay-errors.js';
import { readMultipartTextFields } from './ai-provider-multipart.js';
import { readChatUsage, readImageUsage, readTranscriptionUsage } from './ai-provider-usage-parse.js';
import {
  AI_PROVIDER_USAGE_SINK,
  type IAiProviderCallContext,
  type IAiProviderUsage,
  type IAiProviderUsageSink,
} from './ai-provider-usage-sink.js';
import { forwardToAiProvider, type IAiProviderRelayResponse } from './ai-provider-upstream.js';
import { DbAiProviderUsageSink } from './db-ai-provider-usage-sink.js';

export const DEFAULT_AI_PROVIDER_MAX_CONCURRENT_PER_OWNER = 5;
/** The activity's own `startToCloseTimeout`. */
export const DEFAULT_AI_PROVIDER_TIMEOUT_MS = 10 * 60 * 1000;

export type TAiProviderEnv = 'dev' | 'prod';

export type { IAiProviderRelayResponse } from './ai-provider-upstream.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** One upstream call the relay is about to make, after the endpoint-specific checks. */
interface IRelayCall {
  readonly projectId: string;
  readonly env: TAiProviderEnv;
  readonly kind: TAiProviderModelKind;
  readonly model: string;
  /** The upstream path below the base URL, e.g. `/chat/completions`. */
  readonly path: string;
  readonly rawBody: Uint8Array;
  /** Sent upstream as-is: `application/json`, or the pod's own `multipart/form-data; boundary=…`. */
  readonly contentType: string;
  readonly readUsage: (body: Uint8Array) => IAiProviderUsage | null;
}

type TResolvedSettings = NonNullable<Awaited<ReturnType<AiProviderSettingsService['resolve']>>>;

/**
 * The built-in AI provider relay (ADR 0081 (private)): a runner pod of a project whose OpenAI instance has
 * `platformProvider` calls this instead of the vendor, with the project's internal token as its "API key"; the relay
 * checks the model against the admin's list, asks the usage sink, forwards the body unchanged under the platform key
 * and records the usage. The platform key never leaves the backend.
 */
@Injectable()
export class AiProviderRelayService {
  private readonly logger = new Logger(AiProviderRelayService.name);
  private readonly settings: AiProviderSettingsService;
  private readonly projects: ProjectsService;
  private readonly usageSink: IAiProviderUsageSink;
  private readonly limiter: AiProviderOwnerLimiter;
  private readonly timeoutMs: number;

  constructor(
    @Inject(AiProviderSettingsService) settings: AiProviderSettingsService,
    @Inject(ProjectsService) projects: ProjectsService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(DbAiProviderUsageSink) defaultUsageSink: DbAiProviderUsageSink,
    @Optional() @Inject(AI_PROVIDER_USAGE_SINK) usageSink?: IAiProviderUsageSink,
  ) {
    this.settings = settings;
    this.projects = projects;
    // A provided AI_PROVIDER_USAGE_SINK (the hosted edition's billing, from a @Global() module) wins over the default.
    this.usageSink = usageSink ?? defaultUsageSink;
    this.limiter = new AiProviderOwnerLimiter(
      positiveInt(
        config.get<string>('AI_PROVIDER_MAX_CONCURRENT_PER_OWNER'),
        DEFAULT_AI_PROVIDER_MAX_CONCURRENT_PER_OWNER,
      ),
    );
    this.timeoutMs = positiveInt(config.get<string>('AI_PROVIDER_TIMEOUT_MS'), DEFAULT_AI_PROVIDER_TIMEOUT_MS);
  }

  /** `GET …/models`: the admin's chat models in OpenAI's list shape. */
  async listModels(): Promise<{ object: 'list'; data: { id: string; object: 'model'; owned_by: string }[] }> {
    const resolved = await this.requireConfigured();
    return {
      object: 'list',
      data: resolved.models
        .filter((model) => model.kind === 'chat')
        .map((model) => ({ id: model.id, object: 'model' as const, owned_by: 'falang' })),
    };
  }

  /** `POST …/chat/completions` — `rawBody` is forwarded byte for byte, `body` is its parsed form. */
  async chatCompletions(
    projectId: string,
    env: TAiProviderEnv,
    rawBody: Uint8Array,
    body: unknown,
  ): Promise<IAiProviderRelayResponse> {
    const resolved = await this.requireConfigured();
    const model = this.requireJsonModel(resolved, 'chat', body);
    return this.relay(resolved, {
      contentType: 'application/json',
      env,
      kind: 'chat',
      model,
      path: '/chat/completions',
      projectId,
      rawBody,
      readUsage: readChatUsage,
    });
  }

  /** `POST …/images/generations` (JSON) — an `image` model of the admin's list; usage incl. the number of images. */
  async imagesGenerations(
    projectId: string,
    env: TAiProviderEnv,
    rawBody: Uint8Array,
    body: unknown,
  ): Promise<IAiProviderRelayResponse> {
    const resolved = await this.requireConfigured();
    const model = this.requireJsonModel(resolved, 'image', body);
    return this.relay(resolved, {
      contentType: 'application/json',
      env,
      kind: 'image',
      model,
      path: '/images/generations',
      projectId,
      rawBody,
      readUsage: readImageUsage,
    });
  }

  /**
   * `POST …/audio/transcriptions` (`multipart/form-data`) — the original bytes and `Content-Type` (boundary) are
   * forwarded unchanged; only the `model`/`stream` text fields are read out of the body (`readMultipartTextFields`).
   */
  async audioTranscriptions(
    projectId: string,
    env: TAiProviderEnv,
    rawBody: Buffer,
    contentType: string,
    boundary: string,
  ): Promise<IAiProviderRelayResponse> {
    const resolved = await this.requireConfigured();
    const fields = readMultipartTextFields(rawBody, boundary, ['model', 'stream']);
    const model = fields.model ?? '';
    this.requireAllowedModel(resolved, 'transcribe', model);
    if (fields.stream?.trim().toLowerCase() === 'true') this.refuseStream();
    return this.relay(resolved, {
      contentType,
      env,
      kind: 'transcribe',
      model,
      path: '/audio/transcriptions',
      projectId,
      rawBody,
      readUsage: readTranscriptionUsage,
    });
  }

  /** A JSON request body's `model`, checked against the admin's models of `kind`; `stream: true` refused. */
  private requireJsonModel(resolved: TResolvedSettings, kind: TAiProviderModelKind, body: unknown): string {
    if (!isRecord(body)) {
      aiProviderCallsTotal.inc({ result: 'refused' });
      throw aiProviderRelayError(HttpStatus.BAD_REQUEST, 'invalid_request', 'The request body must be a JSON object');
    }
    const model = typeof body.model === 'string' ? body.model : '';
    this.requireAllowedModel(resolved, kind, model);
    // A streamed reply carries no `usage` by default — the call could not be accounted for.
    if (body.stream === true) this.refuseStream();
    return model;
  }

  private requireAllowedModel(resolved: TResolvedSettings, kind: TAiProviderModelKind, model: string): void {
    if (resolved.models.some((candidate) => candidate.kind === kind && candidate.id === model)) return;
    aiProviderCallsTotal.inc({ result: 'refused' });
    throw aiProviderRelayError(
      HttpStatus.BAD_REQUEST,
      'model_not_allowed',
      `Model "${model}" is not offered by the built-in AI provider for this kind of request (${kind})`,
    );
  }

  private refuseStream(): never {
    aiProviderCallsTotal.inc({ result: 'refused' });
    throw aiProviderRelayError(
      HttpStatus.BAD_REQUEST,
      'stream_not_supported',
      'Streaming is not supported by the built-in AI provider',
    );
  }

  /** Owner slot → `beforeCall` → upstream → `afterCall` on a 2xx; the reply goes back as it came. */
  private async relay(resolved: TResolvedSettings, call: IRelayCall): Promise<IAiProviderRelayResponse> {
    const ownerId = await this.projects.getOwnerId(call.projectId);
    const release = this.acquire(ownerId);
    try {
      const ctx: IAiProviderCallContext = {
        env: call.env,
        kind: call.kind,
        model: call.model,
        ownerId,
        projectId: call.projectId,
      };
      try {
        // Anything thrown here (e.g. a hosted-edition HttpException(402)) reaches the pod unchanged.
        await this.usageSink.beforeCall(ctx);
      } catch (error) {
        aiProviderCallsTotal.inc({ result: 'refused' });
        throw error;
      }
      const response = await forwardToAiProvider({
        apiKey: resolved.apiKey,
        contentType: call.contentType,
        logger: this.logger,
        rawBody: call.rawBody,
        timeoutMs: this.timeoutMs,
        url: `${resolved.baseUrl}${call.path}`,
      });
      if (response.status < 200 || response.status >= 300) {
        aiProviderCallsTotal.inc({ result: 'upstream_error' });
        return response;
      }
      aiProviderCallsTotal.inc({ result: 'ok' });
      await this.recordUsage({ ...ctx, usage: call.readUsage(response.body) });
      return response;
    } finally {
      release();
    }
  }

  private async requireConfigured(): Promise<TResolvedSettings> {
    const resolved = await this.settings.resolve();
    if (!resolved) {
      throw aiProviderRelayError(
        HttpStatus.PRECONDITION_FAILED,
        'ai_provider_not_configured',
        'The built-in AI provider is not configured on this server',
      );
    }
    return resolved;
  }

  private acquire(ownerId: string): () => void {
    try {
      return this.limiter.acquire(ownerId);
    } catch (error) {
      aiProviderCallsTotal.inc({ result: 'refused' });
      throw error;
    }
  }

  /**
   * The upstream answered, so the call happened: an `afterCall` failure is logged and never surfaced — failing the
   * response would make the activity retry and the call run (and be paid for) again. Same policy as the agent's sink.
   */
  private async recordUsage(ctx: Parameters<IAiProviderUsageSink['afterCall']>[0]): Promise<void> {
    try {
      await this.usageSink.afterCall(ctx);
    } catch (error) {
      this.logger.error(`AI provider usage sink afterCall failed: ${describeError(error)}`);
    }
  }
}
