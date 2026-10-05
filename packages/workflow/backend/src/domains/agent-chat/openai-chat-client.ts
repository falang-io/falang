import type {
  IAgentChatResult,
  IAgentChatToolCall,
  IAgentChatToolDefinition,
  IAgentChatUsage,
  TAgentChatMessage,
} from './agent-chat.types.js';
import {
  DEFAULT_AGENT_CHAT_MAX_RETRIES,
  DEFAULT_AGENT_CHAT_TIMEOUT_MS,
  type IAgentChatTransportOptions,
  postJsonWithRetries,
} from './agent-chat-transport.js';

interface IOpenAiToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

interface IOpenAiChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | null;
  readonly tool_calls?: readonly IOpenAiToolCall[];
  readonly tool_call_id?: string;
}

interface IOpenAiUsage {
  readonly prompt_tokens?: number;
  readonly completion_tokens?: number;
  readonly total_tokens?: number;
  /** OpenAI's (and OpenAI-compatible gateways') cached part of `prompt_tokens`. */
  readonly prompt_tokens_details?: { readonly cached_tokens?: number } | null;
  /** DeepSeek's own API reports the cached part here instead. */
  readonly prompt_cache_hit_tokens?: number;
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

/** The cached part of the prompt in either known shape, clamped to `[0, promptTokens]`; `null` when not reported. */
const toCachedPromptTokens = (raw: IOpenAiUsage, promptTokens: number): number | null => {
  const reported = raw.prompt_tokens_details?.cached_tokens ?? raw.prompt_cache_hit_tokens;
  if (typeof reported !== 'number' || !Number.isFinite(reported)) return null;
  return Math.min(Math.max(reported, 0), promptTokens);
};

/** The vendor's `usage` object, or `null` when it is absent or not numeric (some OpenAI-compatible vendors omit it). */
const toUsage = (raw: IOpenAiUsage | undefined): IAgentChatUsage | null => {
  if (!raw || typeof raw !== 'object') return null;
  const promptTokens = Number(raw.prompt_tokens);
  const completionTokens = Number(raw.completion_tokens);
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens)) return null;
  const total = Number(raw.total_tokens);
  const cached = toCachedPromptTokens(raw, promptTokens);
  return {
    completionTokens,
    promptTokens,
    totalTokens: Number.isFinite(total) ? total : promptTokens + completionTokens,
    ...(cached === null ? {} : { cachedPromptTokens: cached }),
  };
};

const toOpenAiMessages = (message: TAgentChatMessage): IOpenAiChatMessage[] => {
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

const toOpenAiTools = (tools: readonly IAgentChatToolDefinition[]) =>
  tools.map((tool) => ({
    function: { description: tool.description, name: tool.name, parameters: tool.inputSchema },
    type: 'function' as const,
  }));

const MAX_ECHOED_ARGUMENTS_LENGTH = 200;

/** One vendor tool call; unparseable arguments (a completion truncated mid-JSON, say) become `{}` plus an `inputError` naming the
 *  problem, so the agent is told to resend the call rather than seeing a misleading "x is required". */
const toToolCall = (call: {
  readonly id: string;
  readonly function: { readonly name: string; readonly arguments: string };
}): IAgentChatToolCall => {
  const raw = call.function.arguments;
  const base = { id: call.id, name: call.function.name };
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

const CORE_BODY_FIELDS = new Set(['messages', 'model', 'tools']);

/** `extraBody` minus the fields this port owns — a caller can never override or inject them. */
const omitCoreFields = (extraBody: Record<string, unknown> | undefined): Record<string, unknown> =>
  Object.fromEntries(Object.entries(extraBody ?? {}).filter(([key]) => !CORE_BODY_FIELDS.has(key)));

export interface ICallOpenAiChatParams {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly messages: readonly TAgentChatMessage[];
  readonly tools: readonly IAgentChatToolDefinition[];
  /** Extra top-level request-body fields (sampling/provider params: `temperature`, `top_p`, `seed`, `reasoning`, …) — for
   *  headless tooling such as the agent tuner; production callers don't pass it. Core fields (`model`, `messages`,
   *  `tools`) always win over it. */
  readonly extraBody?: Record<string, unknown>;
  /** Retries/timeout — see `agent-chat-transport.ts`. Defaults to `DEFAULT_AGENT_CHAT_*`. */
  readonly transport?: IAgentChatTransportOptions;
}

/**
 * Translates `@falang/agent`'s vendor-neutral `system`/`messages`/`tools` into an OpenAI-compatible
 * `/chat/completions` tool-calling request and back — mirrors the request shape already used by
 * `openaiIntegration`'s `callAiText`/`callAiChoice` activities (`packages/workflow-integrations/openai`),
 * extended with `tools`, which those don't use.
 */
export const callOpenAiChat = async (params: ICallOpenAiChatParams): Promise<IAgentChatResult> => {
  const openaiMessages: IOpenAiChatMessage[] = [
    { content: params.system, role: 'system' },
    ...params.messages.flatMap(toOpenAiMessages),
  ];
  const body: Record<string, unknown> = {
    ...omitCoreFields(params.extraBody),
    messages: openaiMessages,
    model: params.model,
  };
  if (params.tools.length > 0) body.tools = toOpenAiTools(params.tools);

  const data = (await postJsonWithRetries(
    `${params.baseUrl}/chat/completions`,
    {
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${params.apiKey}`, 'Content-Type': 'application/json' },
    },
    params.transport ?? { maxRetries: DEFAULT_AGENT_CHAT_MAX_RETRIES, timeoutMs: DEFAULT_AGENT_CHAT_TIMEOUT_MS },
  )) as IOpenAiChatCompletionResponse;
  const message = data.choices[0]?.message;
  const toolCalls: IAgentChatToolCall[] = (message?.tool_calls ?? []).map((call) => toToolCall(call));
  const usage = toUsage(data.usage);
  return { text: message?.content ?? '', toolCalls, ...(usage ? { usage } : {}) };
};
