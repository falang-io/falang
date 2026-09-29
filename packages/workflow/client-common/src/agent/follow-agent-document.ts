/**
 * "Ensure open" semantics for a document the agent is about to touch (ADR 0036 (private), "Opening a
 * document the agent touches" amendment): `true` when `documentId` has no open tab yet and should be
 * opened (and made active); `false` when it already has one, in which case nothing happens — the
 * agent's tool call must never steal the user's active tab away from a document they're already looking
 * at mid-run. Pure and side-effect-free so it's directly unit-testable without constructing a full
 * `WorkflowStore` (whose constructor does real network/IndexedDB I/O) — see `WorkflowStore.
 * followAgentDocument`, the one caller.
 */
export const shouldOpenAgentDocumentTab = (openTabIds: readonly string[], documentId: string): boolean =>
  !openTabIds.includes(documentId);
