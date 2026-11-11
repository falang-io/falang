import type { IChatResult, IChatToolCall, IChatToolDefinition, IChatUsage, TChatMessage } from './types.js';

interface IOpenAiToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

interface IOpenAiTextPart {
  readonly type: 'text';
  readonly text: string;
  readonly cache_control?: { readonly type: 'ephemeral' };
}

interface IOpenAiChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | null | readonly IOpenAiTextPart[];
  readonly tool_calls?: readonly IOpenAiToolCall[];
  readonly tool_call_id?: string;
}

interface IOpenAiUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
}

interface IOpenAiChatCompletionResponse {
  readonly usage?: IOpenAiUsage;
  readonly choices: readonly {
    readonly message: {
      readonly content: string | null;
      readonly tool_calls?: readonly {
        readonly id: string;
        readonly function: { readonly name: string; readonly arguments: string };
      }[];
    };
  }[];
}

/** The vendor's `usage` object, or `null` when it is absent or not numeric (some OpenAI-compatible vendors omit it). */
const toUsage = (raw: IOpenAiUsage | undefined): IChatUsage | null => {
  if (!raw || typeof raw !== 'object') return null;
  const promptTokens = Number(raw.prompt_tokens);
  const completionTokens = Number(raw.completion_tokens);
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  const total = Number(raw.total_tokens);
  return {
    completionTokens,
    promptTokens,
    totalTokens: Number.isFinite(total) ? total : promptTokens + completionTokens,
  };
};

const toOpenAiMessages = (message: TChatMessage): IOpenAiChatMessage[] => {
  switch (message.role) {
    case 'user': {
      return [{ content: message.content, role: 'user' }];
    }
    case 'assistant': {
      const toolCalls: IOpenAiToolCall[] = message.toolCalls.map((call) => ({
        function: { arguments: JSON.stringify(call.input ?? {}), name: call.name },
        id: call.id,
        type: 'function',
      }));
      return [
        {
          content: message.content || null,
          role: 'assistant',
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
      ];
    }
    case 'tool': {
      return message.results.map((result) => ({
        content: result.content,
        role: 'tool',
        tool_call_id: result.toolCallId,
      }));
    }
    default: {
      throw new Error('Unknown agent chat message role');
    }
  }
};

const toOpenAiTools = (tools: readonly IChatToolDefinition[]) =>
  tools.map((tool) => ({
    function: { description: tool.description, name: tool.name, parameters: tool.inputSchema },
    type: 'function' as const,
  }));

const MAX_ECHOED_ARGUMENTS_LENGTH = 200;

/** One vendor tool call; unparseable arguments (a completion truncated mid-JSON, say) become `{}` plus an `inputError` naming the
 *  problem, so the agent is told to resend the call rather than seeing a misleading "x is required". Empty arguments are `{}`:
 *  some models/gateways send `""` for a tool without parameters (`list_files`, `check_project`, …). */
const toToolCall = (call: {
  readonly id: string;
  readonly function: { readonly name: string; readonly arguments?: string };
}): IChatToolCall => {
  const raw = call.function.arguments ?? '';
  const base = { id: call.id, name: call.function.name };
  if (raw.trim() === '') return { ...base, input: {} };
  try {
    return { ...base, input: JSON.parse(raw) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const echoed =
      raw.length > MAX_ECHOED_ARGUMENTS_LENGTH
        ? `${raw.slice(0, MAX_ECHOED_ARGUMENTS_LENGTH)}… (${raw.length} chars)`
        : raw;
    return {
      ...base,
      input: {},
      inputError: `The tool call's arguments were not valid JSON (${reason}): ${echoed}`,
    };
  }
};

/**
 * Claude models cache a prompt prefix only up to explicit `cache_control` breakpoints (DeepSeek and OpenAI cache on
 * their own). Without them an agent run pays full price for every earlier tool result on every call — a 19-call
 * Opus run sent 745 k prompt tokens, ~700 k of them a resent prefix. Checked on the OpenAI-compatible gateway
 * (2026-11-11): the breakpoints pass through on `system`/`user`/`tool` content parts and the next call reads the
 * whole prefix the previous one wrote (`prompt_tokens_details.cached_tokens`).
 */
export const needsPromptCacheBreakpoints = (model: string): boolean => /claude|anthropic/i.test(model);

const withCacheBreakpoint = (message: IOpenAiChatMessage): IOpenAiChatMessage =>
  typeof message.content === 'string' && message.content.length > 0
    ? { ...message, content: [{ cache_control: { type: 'ephemeral' }, text: message.content, type: 'text' }] }
    : message;

/**
 * Marks the system prompt (tools precede it in the cached prefix), the newest message, and the newest message of the
 * previous request (the one before the last assistant turn) — so the next call finds the previous call's cache entry
 * even when many parallel tool results were added since (the vendor looks back at most 20 blocks from a breakpoint).
 * At most three breakpoints, under the vendor's limit of four. Empty messages are never marked.
 */
export const addPromptCacheBreakpoints = (messages: readonly IOpenAiChatMessage[]): IOpenAiChatMessage[] => {
  const marked = new Set<number>([0]);
  const last = messages.length - 1;
  if (last > 0 && messages[last]?.role !== 'assistant') marked.add(last);
  const lastAssistant = messages.findLastIndex((message) => message.role === 'assistant');
  if (lastAssistant > 1 && messages[lastAssistant - 1]?.role !== 'assistant') marked.add(lastAssistant - 1);
  return messages.map((message, index) => (marked.has(index) ? withCacheBreakpoint(message) : message));
};

const CORE_BODY_FIELDS = new Set(['messages', 'model', 'tools']);

/** `extraBody` minus the fields this port owns — a caller can never override or inject them. */
const omitCoreFields = (extraBody: Record<string, unknown> | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(extraBody ?? {}).filter(([key]) => !CORE_BODY_FIELDS.has(key)));

export interface ICallOpenAiChatParams {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly messages: readonly TChatMessage[];
  readonly tools: readonly IChatToolDefinition[];
  readonly signal?: AbortSignal;
  /** Extra top-level request-body fields (sampling/provider params: `temperature`, `top_p`, `seed`, `reasoning`, …) — for
   *  headless tooling such as the agent tuner; production callers don't pass it. Core fields (`model`, `messages`,
   *  `tools`) always win over it. */
  readonly extraBody?: Record<string, unknown>;
}

/**
 * Translates the desktop apps' vendor-neutral `system`/`messages`/`tools` into an OpenAI-compatible
 * `/chat/completions` tool-calling request and back — a straight port of
 * `packages/workflow/backend/src/domains/agent-chat/openai-chat-client.ts`'s wire-format translation
 * (see that file's own doc comment for the `openaiIntegration` lineage), adapted to take
 * `baseUrl`/`apiKey`/`model` directly instead of resolving them from a project credential, since a
 * desktop app has neither a project nor a credential store — just one app-wide `IAgentSettings`
 * (ADR 0026 (private)).
 */
export const callOpenAiChat = async (params: ICallOpenAiChatParams): Promise<IChatResult> => {
  const openaiMessages: IOpenAiChatMessage[] = [
    { content: params.system, role: 'system' },
    ...params.messages.flatMap(toOpenAiMessages),
  ];
  const body: Record<string, unknown> = {
    ...omitCoreFields(params.extraBody),
    messages: needsPromptCacheBreakpoints(params.model) ? addPromptCacheBreakpoints(openaiMessages) : openaiMessages,
    model: params.model,
  };
  if (params.tools.length > 0) body.tools = toOpenAiTools(params.tools);

  const response = await fetch(`${params.baseUrl}/chat/completions`, {
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${params.apiKey}`, 'Content-Type': 'application/json' },
    method: 'POST',
    signal: params.signal,
  });
  if (!response.ok) {
    throw new Error(`OpenAI chat completion failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as IOpenAiChatCompletionResponse;
  const message = data.choices[0]?.message;
  const toolCalls: IChatToolCall[] = (message?.tool_calls ?? []).map((call) => toToolCall(call));
  const usage = toUsage(data.usage);
  return { text: message?.content ?? '', toolCalls, ...(usage ? { usage } : {}) };
};
