import type { NodeStore } from '@falang/scheme';
import { getContainerScopeContribution, getScopeContribution } from './node-scope-contribution.js';
import type { IScopeVariable } from './scope-variable.js';

/** Both plain functions and workflow `trigger-function`s stop the upward walk at their own body. */
const FUNCTION_BOUNDARY_NODE_NAMES = new Set(['function-body', 'trigger-function-body']);

/**
 * Walks up the node tree from `node`, collecting every scope-introducing sibling declared before
 * it in each enclosing scope, plus every enclosing container's own contribution (function
 * parameters, loop `item`/`index`). Which node kinds introduce what is decided by
 * `getScopeContribution`/`getContainerScopeContribution` (`@falang/typescript-common`), not
 * duplicated here.
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
      const contribution = getScopeContribution(siblings[i]);
      if (contribution) localVars.push(contribution);
    }
    scopes.push(localVars);
    scopes.push(getContainerScopeContribution(parent));

    if (FUNCTION_BOUNDARY_NODE_NAMES.has(parent.name)) break;

    current = parent;
    parent = parent.parent;
  }

  return scopes.toReversed().flat();
};
