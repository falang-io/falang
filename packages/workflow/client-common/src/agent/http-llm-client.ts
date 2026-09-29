import type { ILlmClient, ILlmCompleteParams, ILlmResponse } from '@falang/agent';
import { workflowApi } from '../api-client.js';

/**
 * The only real `ILlmClient` implementation (see ADR 0009 (private)'s "`ILlmClient`
 * is an interface in `core/agent`; the real call happens in `backend`") — a thin HTTP proxy to
 * `POST /projects/:projectId/agent/chat`, which resolves the app-wide agent settings an admin
 * configured and does the actual OpenAI-compatible vendor call. No credential/model to pass through
 * any more — see ADR 0031 (private).
 */
export class HttpLlmClient implements ILlmClient {
  private readonly projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  complete(params: ILlmCompleteParams): Promise<ILlmResponse> {
    return workflowApi.agentChat(
      this.projectId,
      { messages: params.messages, system: params.system, tools: params.tools },
      params.signal,
    );
  }
}
