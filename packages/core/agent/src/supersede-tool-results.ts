import type { ILlmToolCall, TLlmMessage } from './llm-client.js';

export const SUPERSEDED_RESULT =
  '[Result removed to save context: superseded by a later call of the same tool. Call it again if you ' +
  'need this information.]';

/** A successful call from the latest batch, with its result text. */
interface ILatestCall {
  readonly call: ILlmToolCall;
  readonly content: string;
}

const stringInput = (call: ILlmToolCall, key: string): string | null => {
  const input = call.input as Record<string, unknown> | null;
  const value = input && typeof input === 'object' ? input[key] : null;
  return typeof value === 'string' ? value : null;
};

/**
 * Whether `later`'s result makes `earlier`'s redundant. Only read-only tools whose result is cheap to
 * re-request and otherwise re-sent to the model on every remaining step of the run:
 * - `get_node_kinds` — by far the largest result (a JSON Schema per node kind); any later call supersedes
 *   every earlier one, whatever its parent/document.
 * - `get_tree` — a later tree of the *same document* (an omitted `documentId` is the run's active
 *   document) supersedes an earlier one it fully covers: the later call is the whole document, asks for
 *   the same `nodeId`, or its subtree contains the earlier call's `nodeId` (the result is the serialized
 *   `INode` subtree, so that node appears as `"id":"<nodeId>"`). The later result is also the fresher
 *   one — the earlier tree predates whatever edits came in between.
 */
const supersedes = (earlier: ILlmToolCall, later: ILatestCall, activeDocumentId: string | null): boolean => {
  if (earlier.name !== later.call.name) return false;
  if (earlier.name === 'get_node_kinds') return true;
  if (earlier.name !== 'get_tree') return false;
  const documentOf = (call: ILlmToolCall) => stringInput(call, 'documentId') ?? activeDocumentId;
  if (documentOf(earlier) !== documentOf(later.call)) return false;
  const laterNodeId = stringInput(later.call, 'nodeId');
  const earlierNodeId = stringInput(earlier, 'nodeId');
  if (laterNodeId === null || laterNodeId === earlierNodeId) return true;
  return earlierNodeId !== null && later.content.includes(`"id":${JSON.stringify(earlierNodeId)}`);
};

const SUPERSEDABLE_TOOLS: ReadonlySet<string> = new Set(['get_node_kinds', 'get_tree']);

/**
 * Called right after a batch of tool results was appended to `messages` (the last element, a `role:
 * 'tool'` message): replaces the content of every *earlier* batch's result that a successful call in
 * this batch supersedes (see `supersedes`) with `SUPERSEDED_RESULT` — so, e.g., at most one batch of
 * `get_node_kinds` catalogs, and one current tree per document, is ever in context. Several calls in the
 * latest batch are all kept; a failed call supersedes nothing. Rebuilds the affected `tool` messages
 * rather than mutating them (they're `readonly`); only the conversation sent to the model changes —
 * `AgentSession.steps` (the UI trace) keeps every full result.
 */
export const supersedeEarlierToolResults = (messages: TLlmMessage[], activeDocumentId: string | null = null): void => {
  const lastIndex = messages.length - 1;
  const lastCallIndex = lastIndex - 1;
  const latestCalls = messages[lastCallIndex];
  const latestResults = messages[lastIndex];
  if (lastIndex < 1 || latestCalls?.role !== 'assistant' || latestResults?.role !== 'tool') return;
  const latest: ILatestCall[] = latestCalls.toolCalls.flatMap((call) => {
    if (!SUPERSEDABLE_TOOLS.has(call.name)) return [];
    const result = latestResults.results.find((entry) => entry.toolCallId === call.id);
    return result && !result.isError ? [{ call, content: result.content }] : [];
  });
  if (latest.length === 0) return;

  const staleCallIds = new Set<string>();
  for (let i = 0; i < lastCallIndex; i += 1) {
    const message = messages[i];
    if (message.role !== 'assistant') continue;
    for (const call of message.toolCalls) {
      if (latest.some((later) => supersedes(call, later, activeDocumentId))) staleCallIds.add(call.id);
    }
  }
  if (staleCallIds.size === 0) return;

  for (let i = 0; i < lastCallIndex; i += 1) {
    const message = messages[i];
    if (message.role !== 'tool' || !message.results.some((result) => staleCallIds.has(result.toolCallId))) continue;
    messages[i] = {
      role: 'tool',
      results: message.results.map((result) =>
        staleCallIds.has(result.toolCallId)
          ? { content: SUPERSEDED_RESULT, isError: result.isError, toolCallId: result.toolCallId }
          : result,
      ),
    };
  }
};
