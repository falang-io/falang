import type { NodeStore } from '@falang/scheme';
import { getContainerScopeContribution, getScopeContributions } from './node-scope-contribution.js';
import type { IScopeVariable } from './scope-variable.js';

/** Plain functions, workflow `trigger-function`s and the popup-only `magic-function` stop the upward walk at their own body. */
const FUNCTION_BOUNDARY_NODE_NAMES = new Set(['function-body', 'trigger-function-body', 'magic-function-body']);

/**
 * Escape hatch for a sibling whose contributed variable's type depends on state this package can't
 * see — e.g. `call-function`/`call-api`'s `returnVariable`, typed by the *target* function/endpoint's
 * signature, which lives in a per-project registry (`@falang/typescript-scheme`'s
 * `TypescriptProjectService`) rather than in the node's own `data`. Deliberately not a
 * `registerScopeContributor`-style global registry (see `node-scope-contribution.ts`): that one is
 * only safe for a type that doesn't depend on which project/container is open, and a per-project
 * registry lookup would collide across concurrently open projects sharing one process. Tried only
 * when the static/dynamic `SCOPE_CONTRIBUTORS` registries contributed nothing for the sibling.
 */
export type TScopeContributionResolver = (node: NodeStore) => IScopeVariable | undefined;

/**
 * Walks up the node tree from `node`, collecting every scope-introducing sibling declared before
 * it in each enclosing scope, plus every enclosing container's own contribution (function
 * parameters, loop `item`/`index`). Which node kinds introduce what is decided by
 * `getScopeContribution`/`getContainerScopeContribution` (`@falang/typescript-common`), not
 * duplicated here; `resolveExtra` (see `TScopeContributionResolver`) is consulted per sibling only
 * when those registries have nothing for it.
 * A `magic` parent is transparent: the walk collects its earlier children like any other siblings and
 * continues upward (it has no container contribution and is no boundary).
 * The result is ordered from outermost (function parameters) to innermost declaration.
 */
export const collectScopeVariables = (node: NodeStore, resolveExtra?: TScopeContributionResolver): IScopeVariable[] => {
  const scopes: IScopeVariable[][] = [];
  let current: NodeStore = node;
  let parent: NodeStore | null = current.parent;

  while (parent) {
    const siblings = parent.children;
    const index = siblings.indexOf(current);
    const localVars: IScopeVariable[] = [];
    for (let i = 0; i < index; i += 1) {
      const sibling = siblings[i];
      const contributions = getScopeContributions(sibling);
      if (contributions.length > 0) {
        localVars.push(...contributions);
      } else {
        const extra = resolveExtra?.(sibling);
        if (extra) localVars.push(extra);
      }
    }
    scopes.push(localVars);
    scopes.push(getContainerScopeContribution(parent));

    if (FUNCTION_BOUNDARY_NODE_NAMES.has(parent.name)) break;

    current = parent;
    parent = parent.parent;
  }

  return scopes.toReversed().flat();
};
