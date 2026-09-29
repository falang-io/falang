import type { ILlmToolCall, ILlmToolDefinition } from './llm-client.js';
import type { TToolExecutionResult } from './tool-executor.js';

/**
 * A host-supplied bundle of extra tools alongside `AGENT_TOOLS` (ADR 0034 §4) — for capabilities that
 * don't touch any one document's node tree directly (creating a new document, creating an integration
 * credential instance, …) and so have no use for `executeToolCall`'s scheme-bound machinery, or for
 * the per-call focus/pause/undo-group treatment `AgentSession` gives the 10 built-in node tools. Mirrors
 * `IAgentContextProvider`'s "host defines the concept, `core/agent` only sees an opaque contract" shape
 * — `core/agent` still knows nothing about "documents" or "integrations" by name.
 */
export interface IAgentToolProvider {
  readonly tools: readonly ILlmToolDefinition[];
  execute(call: ILlmToolCall): TToolExecutionResult | Promise<TToolExecutionResult>;
}
