import type { NodeStore } from '@falang/scheme';
import { collectScopeVariables } from '@falang/typescript-common';

/**
 * The auto-declared local a non-void function body puts in scope (see `@falang/typescript-common`'s
 * `function-body` scope contributor) — a `return` node's default value.
 */
export const RETURN_VALUE_NAME = 'returnValue';

/** Whether `node` sits in a function that returns a value: `returnValue` is a (mutable) variable in its scope. */
export const isInValueReturningFunction = (node: NodeStore): boolean =>
  collectScopeVariables(node).some(
    (variable) => variable.name === RETURN_VALUE_NAME && variable.type.constant !== true,
  );
