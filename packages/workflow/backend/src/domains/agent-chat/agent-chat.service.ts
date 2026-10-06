import { BadGatewayException, Inject, Injectable, Logger, Optional, PreconditionFailedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgentSettingsService } from '../admin/app-settings/agent-settings.service.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { agentChatCallsTotal, agentChatDuration, agentChatTokensTotal } from '../metrics/metrics.js';
import type { IAgentChatResult } from './agent-chat.types.js';
import type { AgentChatRequestDto } from './dto/agent-chat-request.dto.js';
import {
  AgentChatVendorError,
  DEFAULT_AGENT_CHAT_MAX_RETRIES,
  DEFAULT_AGENT_CHAT_TIMEOUT_MS,
  type IAgentChatTransportOptions,
} from './agent-chat-transport.js';
import { callOpenAiChat } from './openai-chat-client.js';
import { DbAgentUsageSink } from './db-agent-usage-sink.js';
import { AGENT_USAGE_SINK, type IAgentUsageSink } from './agent-usage-sink.js';

/** A non-negative number from an env var, or `fallback` when it's unset/garbage (ConfigService returns env strings). */
const readNumber = (config: ConfigService, key: string, fallback: number): number => {
  const value = Number(config.get<string>(key));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

/**
 * Backs `POST /projects/:projectId/agent/chat` — the only real-vendor call in ADR 0009's still-mock
 * `ILlmClient` chain (see the ADR's "`ILlmClient` is an interface in `core/agent`; the real call
 * happens in `backend`"). Resolves the app-wide `AgentSettingsService` config (base URL / model /
 * API key, configured once by an admin) rather than a per-project "openai" integration credential —
 * see ADR 0031 (private) for why the per-project credential
 * stopped doubling as the agent's own credential.
 */
@Injectable()
export class AgentChatService {
  private readonly projectsService: ProjectsService;
  private readonly agentSettings: AgentSettingsService;

  private readonly transport: IAgentChatTransportOptions;
  private readonly usageSink: IAgentUsageSink;
  private readonly logger = new Logger(AgentChatService.name);

  constructor(
    @Inject(ProjectsService) projectsService: ProjectsService,
    @Inject(AgentSettingsService) agentSettings: AgentSettingsService,
    @Inject(ConfigService) config: ConfigService,
    @Inject(DbAgentUsageSink) defaultUsageSink: DbAgentUsageSink,
    @Optional() @Inject(AGENT_USAGE_SINK) usageSink?: IAgentUsageSink,
  ) {
    // A provided AGENT_USAGE_SINK (the cloud edition's, from a @Global() module) wins over the community default.
    this.usageSink = usageSink ?? defaultUsageSink;
    this.projectsService = projectsService;
    this.agentSettings = agentSettings;
    // `AGENT_CHAT_MAX_RETRIES` (default 3) / `AGENT_CHAT_TIMEOUT_MS` (default 10 min, per attempt) — see
    // `agent-chat-transport.ts`.
    this.transport = {
      maxRetries: readNumber(config, 'AGENT_CHAT_MAX_RETRIES', DEFAULT_AGENT_CHAT_MAX_RETRIES),
      timeoutMs:
        readNumber(config, 'AGENT_CHAT_TIMEOUT_MS', DEFAULT_AGENT_CHAT_TIMEOUT_MS) || DEFAULT_AGENT_CHAT_TIMEOUT_MS,
    };
  }

  async chat(projectId: string, ownerId: string, body: AgentChatRequestDto): Promise<IAgentChatResult> {
    await this.projectsService.getOwnedProject(projectId, ownerId);

    const resolved = await this.agentSettings.resolve();
    if (!resolved) {
      agentChatCallsTotal.inc({ result: 'rejected' });
      throw new PreconditionFailedException('AI agent is not configured — ask an administrator');
    }

    const usageCtx = { model: resolved.model, projectId, userId: ownerId };
    // Anything thrown here (e.g. a cloud sink's HttpException(402)) reaches the client unchanged.
    try {
      await this.usageSink.beforeCall(usageCtx);
    } catch (error) {
      agentChatCallsTotal.inc({ result: 'rejected' });
      throw error;
    }
    const startedAt = Date.now();
    const result = await this.callVendor(resolved, body).catch((error: unknown) => {
      agentChatCallsTotal.inc({ result: 'vendor_error' });
      agentChatDuration.observe({}, (Date.now() - startedAt) / 1000);
      throw error;
    });
    agentChatCallsTotal.inc({ result: 'ok' });
    agentChatDuration.observe({}, (Date.now() - startedAt) / 1000);
    if (result.usage) {
      agentChatTokensTotal.inc({ kind: 'prompt' }, result.usage.promptTokens);
      agentChatTokensTotal.inc({ kind: 'completion' }, result.usage.completionTokens);
    }
    try {
      await this.usageSink.afterCall({ ...usageCtx, durationMs: Date.now() - startedAt, usage: result.usage ?? null });
    } catch (error) {
      this.logger.error(`Agent usage sink afterCall failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return result;
  }

  private async callVendor(
    resolved: { readonly apiKey: string; readonly baseUrl: string; readonly model: string },
    body: AgentChatRequestDto,
  ): Promise<IAgentChatResult> {
    try {
      return await callOpenAiChat({
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl,
        messages: body.messages,
        model: resolved.model,
        system: body.system,
        tools: body.tools,
        transport: this.transport,
      });
    } catch (error) {
      // A 502 with the real reason instead of Nest's generic "Internal server error" — the chat panel
      // shows `message` as the run's error.
      if (error instanceof AgentChatVendorError) throw new BadGatewayException(error.message);
      throw error;
    }
  }
}
