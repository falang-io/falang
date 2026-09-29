import type { IAgentChatUsage } from './agent-chat.types.js';

export interface IAgentUsageCallContext {
  readonly userId: string;
  readonly projectId: string;
  readonly model: string;
}

export interface IAgentUsageAfterCallContext extends IAgentUsageCallContext {
  /** What the vendor reported; `null` when it sent no `usage` object or the call failed. */
  readonly usage: IAgentChatUsage | null;
  readonly durationMs: number;
}

/**
 * The seam around every vendor call `AgentChatService` makes. The community edition records usage
 * (`DbAgentUsageSink`); the hosted cloud edition meters it in credits and refuses calls with an exhausted
 * balance — it provides its own `AGENT_USAGE_SINK` instead of forking `AgentChatService`.
 *
 * Overriding: export `AGENT_USAGE_SINK` from a `@Global()` Nest module imported into `AppModule` (a global
 * provider is visible to `AgentChatModule` without it importing that module). `AgentChatService` injects
 * the token `@Optional()` and only falls back to `DbAgentUsageSink` when nothing provides it.
 */
export interface IAgentUsageSink {
  /** Runs before the vendor call. Throwing (e.g. `HttpException(402)`) aborts the call; the error reaches the client unchanged. */
  beforeCall: (ctx: IAgentUsageCallContext) => Promise<void>;
  /** Runs after the vendor call. Errors are logged by the caller and never surfaced. */
  afterCall: (ctx: IAgentUsageAfterCallContext) => Promise<void>;
}

export const AGENT_USAGE_SINK = Symbol('AGENT_USAGE_SINK');
