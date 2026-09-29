import type { NodesStack } from '@falang/dto';
import type { IAgentNodeKindFilter } from './node-kind-filter.js';
import { getAllowedChildNames } from './node-kinds.js';

// Error texts shared by `insert_node`/`insert_nodes`/`set_out`/`move_nodes` — split out of `insert-nodes.ts`.

/** Shared "the first child can't have an out" message for `insert_node`/`insert_nodes`/`set_out` — the
 *  first child (index 0) of any parent is drawn continuing the main execution path straight down (this
 *  generalizes `@falang/scheme`'s own `canHaveOut`, whose position check is the same "index 0" rule; see
 *  its own doc comment), and the scheme editor can't render that chain also jumping elsewhere. A real
 *  2026-09-22 agent chat produced exactly this shape of invalid tree twice (an `if-child[0]` with
 *  `out: break`, a `telegram-question-option[0]` with `out: continue`). Only a node kind whose own
 *  `haveOut` is set can carry an `out` at all — `buildNode`/`set_out` already check that separately, so by
 *  the time this message fires, `haveOut` is known to be true and the only remaining problem is position. */
export const describeFirstChildOutError = (parentName: string, path: string): string =>
  `${path}: the first child of "${parentName}" is drawn continuing straight down as the main execution ` +
  'path, so it cannot itself have an out (break/continue/return/throw). Move the branch that needs the jump ' +
  'to a later position instead (for "if", swap the two branches and flip meta.trueOnRight, which keeps the ' +
  'exact same semantics) — do not append the out-type node as a plain last child, the editor only draws the ' +
  'jump line for a real out.';

/** Longest node kind name echoed back verbatim in an error — see `quoteKindName`. */
const MAX_ECHOED_NAME_LENGTH = 60;

/** A caller-supplied node kind name as quoted in an error message, cut at `MAX_ECHOED_NAME_LENGTH`: a
 *  real 2026-09-28 chat put a whole ~8 KB JSON-encoded subtree into `node.name`, and the error echoed all of
 *  it back as the "kind" — the parent name after it was then easy to misread as the rejected kind. */
export const quoteKindName = (name: string): string =>
  JSON.stringify(name.length > MAX_ECHOED_NAME_LENGTH ? `${name.slice(0, MAX_ECHOED_NAME_LENGTH)}…` : name);

/** Error for a `name` that is no node kind of the stack at all — distinct from "not allowed under this
 *  parent", with a dedicated hint when the name is really a JSON-encoded node. */
export const describeUnknownKind = (name: string): string => {
  if (/^\s*[[{]/.test(name)) {
    return (
      `${quoteKindName(name)} is not a node kind: \`name\` must be just the kind name (e.g. "action"), but ` +
      'this looks like a whole JSON-encoded node. Pass the node itself as an object — { "name", "data", ' +
      '"children", "out" } — with insert_nodes.'
    );
  }
  return `Unknown node kind ${quoteKindName(name)} — call get_node_kinds for the kinds allowed under the parent.`;
};

/** Shared "can't insert here" message for `insert_node`/`insert_nodes`/`move_nodes` — special-cased for a
 *  fixed-tuple parent (e.g. `if`), whose `getAllowedChildNames` is always `[]` by design (see that
 *  function's own comment): pointing the caller at the tuple's own slot names instead of an unhelpful empty
 *  list is what a real 2026-09-22 agent chat had to discover the hard way, across several failed attempts.
 *  The "allowed:" list goes through `nodeKindFilter` like `get_node_kinds`' own listing (otherwise it
 *  re-lists every hidden vendor kind — the token cost the filter exists to avoid); validation itself never
 *  does. */
export const describeNotAllowedError = (
  name: string,
  parentName: string,
  stack: NodesStack,
  nodeKindFilter?: IAgentNodeKindFilter,
): string => {
  if (!stack.configsMap.has(name)) return describeUnknownKind(name);
  const parentCfg = stack.getConfig(parentName);
  if (parentCfg.childTuple) {
    return (
      `Node kind ${quoteKindName(name)} cannot be inserted directly under "${parentName}" — its children are a fixed ` +
      `tuple (${parentCfg.childTuple.join(', ')}), not a list you can insert into. Target one of its existing ` +
      `slot ids instead (see get_tree), or use insert_nodes to build the whole "${parentName}" subtree ` +
      'in one call, slot content included.'
    );
  }
  const allowedNames = getAllowedChildNames(parentName, stack);
  const listedNames = nodeKindFilter ? allowedNames.filter((kind) => nodeKindFilter.isListed(kind)) : allowedNames;
  const hidden = allowedNames.length - listedNames.length;
  const hiddenNote = nodeKindFilter?.hiddenNote ? ` — ${nodeKindFilter.hiddenNote}` : '';
  const hiddenPart = hidden > 0 ? `(+${hidden} not listed${hiddenNote})` : '';
  const allowedText = [listedNames.join(', '), hiddenPart].filter(Boolean).join(' ');
  return `Node kind ${quoteKindName(name)} is not allowed under "${parentName}"; allowed: ${allowedText}`;
};
