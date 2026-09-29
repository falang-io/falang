import type { Scheme } from '../scheme/scheme.js';

/**
 * Whether `id` may be given a non-null `out` (break/continue/return/throw) — see `setOutNode`, which
 * enforces this, and `IfIconStore.trueOnRight`/`WhileIconStore.trueIsMain` for the branch-direction
 * flags this is unrelated to.
 *
 * `false` when:
 * - the node's own `INodeConfig.haveOut` isn't set — only node kinds that render a trailing-out arrow
 *   at all (`if-child`/`switch-option`/`parallel-thread`/`cycle`("while")/`pseudo-cycle`) can have one;
 * - the node is `children[0]` of its own parent — in this visual language the first child always
 *   continues the parent's main execution path straight down, so it must never jump elsewhere. This
 *   is the same rule `@falang/dto`'s `createZodUnion` enforces on every parsed node, and the same one
 *   the renderer has always treated as an error state (`SkewerStore.hasOutError`).
 *
 * Clearing an existing `out` (`outNode: null`) is always allowed regardless of this check.
 *
 * Note for callers building a context menu: this is the *structural* rule only. The out-menu builders
 * in `@falang/typescript-scheme`/`@falang/text-scheme` additionally require the node to be a branch of
 * a threads icon (`if-child`/`switch-option`/`parallel-thread`), deliberately keeping `out` off
 * `cycle`/`pseudo-cycle` nodes: a cycle's own skewer never gets `isFirst = false` (only
 * `updateThreadsChildPositions` sets it), so an `out` placed there would render as `hasOutError`'s red
 * error box no matter where the cycle sits.
 */
export const canHaveOut = (scheme: Scheme, id: string): boolean => {
  const node = scheme.nodes.getNode(id);
  const config = scheme.infra.structure.getConfig(node.name);
  if (!config.haveOut) return false;
  const parent = node.parent;
  if (parent) {
    const index = parent.children.findIndex((child) => child.id === node.id);
    if (index === 0) return false;
  }
  return true;
};
