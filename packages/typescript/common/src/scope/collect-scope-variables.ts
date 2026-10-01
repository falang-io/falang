import type { NodeStore } from '@falang/scheme';
import { getContainerScopeContribution, getScopeContributions } from './node-scope-contribution.js';
import type { IScopeVariable } from './scope-variable.js';

/** Plain functions, workflow `trigger-function`s and the popup-only `magic-function` stop the upward walk at their own body. */
const FUNCTION_BOUNDARY_NODE_NAMES = new Set(['function-body', 'trigger-function-body', 'magic-function-body']);

/**
 * Walks up the node tree from `node`, collecting every scope-introducing sibling declared before
 * it in each enclosing scope, plus every enclosing container's own contribution (function
 * parameters, loop `item`/`index`). Which node kinds introduce what is decided by
 * `getScopeContribution`/`getContainerScopeContribution` (`@falang/typescript-common`), not
 * duplicated here.
 * A `magic` parent is transparent: the walk collects its earlier children like any other siblings and
 * continues upward (it has no container contribution and is no boundary).
 * The result is ordered from outermost (function parameters) to innermost declaration.
 */
export const collectScopeVariables = (node: NodeStore): IScopeVariable[] => {
  const scopes: IScopeVariable[][] = [];
  let current: NodeStore = node;
  let parent: NodeStore | null = current.parent;

  while (parent) {
    const siblings = parent.children;
    const index = siblings.indexOf(current);
    const localVars: IScopeVariable[] = [];
    for (let i = 0; i < index; i += 1) {
      localVars.push(...getScopeContributions(siblings[i]));
    }
    scopes.push(localVars);
    scopes.push(getContainerScopeContribution(parent));

    if (FUNCTION_BOUNDARY_NODE_NAMES.has(parent.name)) break;

    current = parent;
    parent = parent.parent;
  }

  return scopes.toReversed().flat();
};
