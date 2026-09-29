import type { IChatResult, IChatToolCall, IChatToolDefinition, IChatUsage, TChatMessage } from './types.js';

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
 *  problem, so the agent is told to resend the call rather than seeing a misleading "x is required". */
const toToolCall = (call: {
  readonly id: string;
  readonly function: { readonly name: string; readonly arguments: string };
}): IChatToolCall => {
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

export interface ICallOpenAiChatParams {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly system: string;
  readonly messages: readonly TChatMessage[];
  readonly tools: readonly IChatToolDefinition[];
  readonly signal?: AbortSignal;
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
  const body: Record<string, unknown> = { messages: openaiMessages, model: params.model };
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
