import type { ILlmClient, ILlmCompleteParams, ILlmResponse } from '@falang/agent';
import { generateUuid } from '../generate-uuid.js';

/**
 * The only real `ILlmClient` implementation for this app (see ADR 0009 (private)'s
 * "`ILlmClient` is an interface in `core/agent`; the real call happens in `backend`", extended to
 * desktop products by ADR 0026 (private)) — a thin proxy over the `falang.agent.chat`
 * IPC call, which does the actual OpenAI-compatible vendor call in `main` (so it runs under Node's
 * CORS-free `fetch`, and the app-wide credential in `settings.json` never has to reach the renderer).
 * `ipcRenderer.invoke` has no built-in cancellation, so `complete()` generates its own request id and,
 * on `params.signal` aborting, fires `falang.agent.cancelChat` to abort the underlying `fetch` in `main`.
 */
export class ElectronLlmClient implements ILlmClient {
  complete(params: ILlmCompleteParams): Promise<ILlmResponse> {
    const requestId = generateUuid();
    if (params.signal) {
      if (params.signal.aborted) globalThis.falang.agent.cancelChat(requestId).catch(() => null);
      else
        params.signal.addEventListener('abort', () => globalThis.falang.agent.cancelChat(requestId).catch(() => null));
    }
    return globalThis.falang.agent.chat(requestId, {
      messages: params.messages,
      system: params.system,
      tools: params.tools,
    });
  }
}
