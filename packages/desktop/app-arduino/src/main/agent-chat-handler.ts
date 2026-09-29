import {
  callOpenAiChat,
  type IChatResult,
  type IChatToolDefinition,
  type TChatMessage,
} from '@falang/desktop-llm-client';
import { getAgentSettings } from './settings.js';

export interface IAgentChatParams {
  readonly system: string;
  readonly messages: readonly TChatMessage[];
  readonly tools: readonly IChatToolDefinition[];
}

/**
 * Tracks one `AbortController` per in-flight `agent:chat` call, keyed by a request id the renderer
 * generates — `ipcRenderer.invoke` has no built-in cancellation, so `AgentSession.cancel()`
 * (`@falang/agent`) needs an explicit `agent:chat-cancel` round trip to actually abort the underlying
 * `fetch` in this process, rather than just stopping the renderer from starting another turn. See
 * ADR 0026 (private).
 */
const inFlight = new Map<string, AbortController>();

export const runAgentChat = async (requestId: string, params: IAgentChatParams): Promise<IChatResult> => {
  const settings = await getAgentSettings();
  if (!settings?.baseUrl || !settings.model) {
    throw new Error('Configure the agent (OpenAI-compatible base URL + model) in Settings first');
  }
  const controller = new AbortController();
  inFlight.set(requestId, controller);
  try {
    return await callOpenAiChat({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      messages: params.messages,
      model: settings.model,
      signal: controller.signal,
      system: params.system,
      tools: params.tools,
    });
  } finally {
    inFlight.delete(requestId);
  }
};

export const cancelAgentChat = (requestId: string): void => {
  inFlight.get(requestId)?.abort();
};
