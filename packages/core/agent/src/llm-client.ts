export interface ILlmToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface ILlmToolCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  /** Set by an `ILlmClient` when the vendor's raw arguments could not be parsed (e.g. a completion cut off
   *  mid-JSON) — `input` is then `{}`. `AgentSession` answers such a call with this error instead of running
   *  the tool on an empty input, which would only produce a misleading "parentId is required"-style error. */
  readonly inputError?: string;
}

export interface ILlmToolResult {
  readonly toolCallId: string;
  readonly content: string;
  readonly isError: boolean;
}

export type TLlmMessage =
  | { readonly role: 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string; readonly toolCalls: readonly ILlmToolCall[] }
  | { readonly role: 'tool'; readonly results: readonly ILlmToolResult[] };

export interface ILlmCompleteParams {
  readonly system: string;
  readonly messages: readonly TLlmMessage[];
  readonly tools: readonly ILlmToolDefinition[];
  readonly signal?: AbortSignal;
}

/** Token counts a vendor reported for one completion (`usage.prompt_tokens` etc.). */
export interface ILlmUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface ILlmResponse {
  readonly text: string;
  readonly toolCalls: readonly ILlmToolCall[];
  /** Absent when the vendor sent no `usage` object (some OpenAI-compatible ones don't). */
  readonly usage?: ILlmUsage;
}

export interface ILlmClient {
  complete: (params: ILlmCompleteParams) => Promise<ILlmResponse>;
}
