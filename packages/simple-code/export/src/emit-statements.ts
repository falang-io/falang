import type { INode } from '@falang/dto';

/** A container node's (`if-child`/`switch-option`/function-body/while/foreach/pseudo-cycle) statement
 * list, in emission order — its own children followed by its `.out` (break/continue/return/throw),
 * the same `appendOut` convention `@falang/logic-constructor` uses. `out` is optional — a function
 * body has none. */
export const emitStatements = (
  children: readonly INode[] | undefined,
  generateNode: (node: INode) => void,
  out?: INode,
): void => {
  (children ?? []).forEach((child) => generateNode(child));
  if (out) generateNode(out);
};
