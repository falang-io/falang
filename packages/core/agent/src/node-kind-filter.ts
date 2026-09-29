/**
 * A host policy trimming what `get_node_kinds` *lists* — never what it accepts: an unlisted kind can still
 * be inserted, `insert_node`/`insert_nodes` validate against the full `NodesStack` exactly as before.
 * Exists for token economy (ADR 0034 (private)'s 2026-09-27 "token budget" note): the workflow product's
 * stack carries every registered vendor's node kinds, and a single `get_node_kinds` for a project using
 * only Telegram + OpenAI used to be ~100 KB, ~70 KB of it vendors the project has no integration for.
 * Like `IAgentContextProvider`/`IAgentToolProvider`, opaque to this package — it knows no vendor by name.
 */
export interface IAgentNodeKindFilter {
  /** Whether `get_node_kinds` should list this node kind. */
  isListed(name: string): boolean;
  /** Attached to `get_node_kinds`' result whenever at least one kind was hidden — e.g. how to unlock them. */
  readonly hiddenNote?: string;
}
