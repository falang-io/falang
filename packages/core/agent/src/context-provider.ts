import type { Scheme } from '@falang/scheme';

/**
 * What a run's context providers see (ADR 0036 — "no home document"). There is no tree/root node handed
 * to providers any more — only the id of whatever document the user has open in the editor (if any), plus
 * a lazy way to resolve it to a real `Scheme` for a provider that actually needs one (e.g. to read scope
 * variables off its root node). `getActiveScheme` is a getter, not a resolved value, so a provider that
 * never calls it never triggers the host's document resolver — and whatever that resolver does on the
 * side, e.g. acquiring a document lock.
 */
export interface IAgentRunContext {
  /** The document open in the editor when this run started, or `null` if none — the same id
   *  `AgentSession` falls back to for a documentId-less tool call. */
  readonly activeDocumentId: string | null;
  /** The node the run is focused on (`IAgentRunOptions.focusNodeId`, ADR 0046), if any — e.g. the insertion
   *  point of a magic node. Resolve it against `getActiveScheme()`. */
  readonly focusNodeId?: string;
  /** Resolves `activeDocumentId` to its `Scheme`, lazily and on every call (not cached) — `null` when
   *  there's no active document, or when resolving it fails (a resolver throw is swallowed here, not
   *  surfaced to the provider). */
  readonly getActiveScheme: () => Scheme | null;
}

export interface IAgentContextProvider {
  /** Extra context for the LLM about the run's active document; null = nothing to add. */
  describe: (context: IAgentRunContext) => string | null;
}
