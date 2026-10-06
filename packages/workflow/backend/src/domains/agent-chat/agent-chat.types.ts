/**
 * Wire shapes for `POST /projects/:projectId/agent/chat` — deliberately duplicated from
 * `@falang/agent`'s `ILlmClient` types (`llm-client.ts`) rather than imported: `@falang/agent`
 * depends on `@falang/scheme` (React/MobX), which has no business in this NestJS backend. Keep the
 * two in sync by hand — they're small and stable (see ADR 0009 (private)).
 */
export interface IAgentChatToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface IAgentChatToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  /** The raw arguments were not valid JSON — `input` is then `{}` (see `@falang/agent`'s `ILlmToolCall`). */
  readonly inputError?: string;
}

export interface IAgentChatToolResult {
  readonly toolCallId: string;
  readonly content: string;
  readonly isError: boolean;
}

export type TAgentChatMessage =
  | { readonly role: 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string; readonly toolCalls: readonly IAgentChatToolCall[] }
  | { readonly role: 'tool'; readonly results: readonly IAgentChatToolResult[] };

/** Token usage the vendor reported for one call (`usage.prompt_tokens` etc.); absent when it sent none. */
export interface IAgentChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  /**
   * The part of `promptTokens` the vendor served from its prompt cache (usually billed cheaper); absent when it
   * reported none. Always `<= promptTokens`.
   */
  readonly cachedPromptTokens?: number;
}

export interface IAgentChatResult {
  readonly text: string;
  readonly toolCalls: readonly IAgentChatToolCall[];
  readonly usage?: IAgentChatUsage;
}
