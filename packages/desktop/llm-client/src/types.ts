/**
 * Wire shapes for the desktop apps' `agent:chat` IPC call — deliberately duplicated from
 * `@falang/agent`'s `ILlmClient` types (`llm-client.ts`) rather than imported: `@falang/agent`
 * depends on `@falang/scheme` (React/MobX), which has no business in an Electron `main` process.
 * Keep the two in sync by hand — they're small and stable (see ADR 0009 (private)
 * and ADR 0026 (private)). Structurally identical to
 * `packages/workflow/backend/src/domains/agent-chat/agent-chat.types.ts`, which made the same call
 * for the same reason on the workflow product's backend.
 */
export interface IChatToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface IChatToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  /** The raw arguments were not valid JSON — `input` is then `{}` (see `@falang/agent`'s `ILlmToolCall`). */
  readonly inputError?: string;
}

export interface IChatToolResult {
  readonly toolCallId: string;
  readonly content: string;
  readonly isError: boolean;
}

export type TChatMessage =
  | { readonly role: 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string; readonly toolCalls: readonly IChatToolCall[] }
  | { readonly role: 'tool'; readonly results: readonly IChatToolResult[] };

/** Token usage the vendor reported for one call; absent when it sent none. */
export interface IChatUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface IChatResult {
  readonly text: string;
  readonly toolCalls: readonly IChatToolCall[];
  readonly usage?: IChatUsage;
}

/** Persisted in each desktop app's `settings.json` (see `main/settings.ts`) — app-wide, not per-project: these apps have no backend/credential concept (ADR 0026 (private)). */
export interface IAgentSettings {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}
