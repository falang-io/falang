import { runWithEgressVendor } from '@falang/workflow-egress';
import { HttpStatus, Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch as undiciFetch, getGlobalDispatcher, type Dispatcher } from 'undici';
import { AiProviderSettingsService } from '../admin/app-settings/ai-provider-settings.service.js';
import { parseOpenAiUsage, type IOpenAiUsage } from '../agent-chat/openai-chat-client.js';
import { aiProviderCallsTotal } from '../metrics/metrics.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { AiProviderOwnerLimiter } from './ai-provider-owner-limiter.js';
import { aiProviderRelayError } from './ai-provider-relay-errors.js';
import {
  AI_PROVIDER_USAGE_SINK,
  type IAiProviderCallContext,
  type IAiProviderUsage,
  type IAiProviderUsageSink,
} from './ai-provider-usage-sink.js';
import { DbAiProviderUsageSink } from './db-ai-provider-usage-sink.js';

/** The vendor the relay speaks for: its upstream calls go through the admin's egress proxy like that vendor's (ADR 0056). */
const AI_PROVIDER_EGRESS_VENDOR = 'openai';
export const DEFAULT_AI_PROVIDER_MAX_CONCURRENT_PER_OWNER = 5;
/** The activity's own `startToCloseTimeout`. */
export const DEFAULT_AI_PROVIDER_TIMEOUT_MS = 10 * 60 * 1000;

export type TAiProviderEnv = 'dev' | 'prod';

export interface IAiProviderRelayResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: Uint8Array;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Token usage of a 2xx chat completion reply; `null` when the body isn't JSON or carries no numeric `usage`. */
export const readChatUsage = (body: Uint8Array): IAiProviderUsage | null => {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body).toString('utf8'));
    return isRecord(parsed) ? parseOpenAiUsage(parsed.usage as IOpenAiUsage | undefined) : null;
  } catch {
    return null;
  }
};

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
    if (!isRecord(body)) {
      aiProviderCallsTotal.inc({ result: 'refused' });
      throw aiProviderRelayError(HttpStatus.BAD_REQUEST, 'invalid_request', 'The request body must be a JSON object');
    }
    const model = typeof body.model === 'string' ? body.model : '';
    if (!resolved.models.some((candidate) => candidate.kind === 'chat' && candidate.id === model)) {
      aiProviderCallsTotal.inc({ result: 'refused' });
      throw aiProviderRelayError(
        HttpStatus.BAD_REQUEST,
        'model_not_allowed',
        `Model "${model}" is not offered by the built-in AI provider`,
      );
    }
    // A streamed reply carries no `usage` by default — the call could not be accounted for.
    if (body.stream === true) {
      aiProviderCallsTotal.inc({ result: 'refused' });
      throw aiProviderRelayError(
        HttpStatus.BAD_REQUEST,
        'stream_not_supported',
        'Streaming is not supported by the built-in AI provider',
      );
    }

    const ownerId = await this.projects.getOwnerId(projectId);
    const release = this.acquire(ownerId);
    try {
      const ctx: IAiProviderCallContext = { env, kind: 'chat', model, ownerId, projectId };
      try {
        // Anything thrown here (e.g. a hosted-edition HttpException(402)) reaches the pod unchanged.
        await this.usageSink.beforeCall(ctx);
      } catch (error) {
        aiProviderCallsTotal.inc({ result: 'refused' });
        throw error;
      }
      const response = await this.forward(`${resolved.baseUrl}/chat/completions`, resolved.apiKey, rawBody);
      if (response.status < 200 || response.status >= 300) {
        aiProviderCallsTotal.inc({ result: 'upstream_error' });
        return response;
      }
      aiProviderCallsTotal.inc({ result: 'ok' });
      await this.recordUsage({ ...ctx, usage: readChatUsage(response.body) });
      return response;
    } finally {
      release();
    }
  }

  private async requireConfigured(): Promise<NonNullable<Awaited<ReturnType<AiProviderSettingsService['resolve']>>>> {
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

  /** One upstream call under the platform key, routed as the `openai` vendor, with the relay's own timeouts. */
  private async forward(url: string, apiKey: string, rawBody: Uint8Array): Promise<IAiProviderRelayResponse> {
    const { timeoutMs } = this;
    // The global dispatcher is the egress router once installed (proxy or direct per vendor); the interceptor only
    // lifts undici's 300 s header/body timeouts to the relay's own — a model may think for minutes before answering.
    const dispatcher = getGlobalDispatcher().compose(
      (dispatch: Dispatcher['dispatch']): Dispatcher['dispatch'] =>
        (options, handler) =>
          dispatch({ ...options, headersTimeout: timeoutMs, bodyTimeout: timeoutMs }, handler),
    );
    try {
      return await runWithEgressVendor(AI_PROVIDER_EGRESS_VENDOR, async () => {
        const response = await undiciFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: rawBody,
          dispatcher,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        });
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          body: new Uint8Array(await response.arrayBuffer()),
        };
      });
    } catch (error) {
      aiProviderCallsTotal.inc({ result: 'failed' });
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw aiProviderRelayError(
          HttpStatus.GATEWAY_TIMEOUT,
          'ai_provider_timeout',
          `The built-in AI provider did not answer within ${Math.round(timeoutMs / 1000)} s`,
        );
      }
      this.logger.warn(`AI provider upstream call failed: ${describeError(error)}`);
      throw aiProviderRelayError(
        HttpStatus.BAD_GATEWAY,
        'ai_provider_unreachable',
        'The built-in AI provider could not be reached',
      );
    }
  }
}
