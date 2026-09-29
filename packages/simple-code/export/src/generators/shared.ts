import type { INode } from '@falang/dto';

/** A `switch-option` whose `data` is exactly this sentinel compiles to the language's `default`
 * case — same literal convention `@falang/logic-constructor`'s `cpp-control-flow-emitters.ts` uses. */
export const DEFAULT_CASE_VALUE = 'default';

export interface IIfBranches {
  readonly thenChild?: INode;
  readonly elseChild?: INode;
}

/** `if` branches are positional: child 0 = "then", child 1 = "else", flipped by `meta.trueOnRight` —
 * same convention `@falang/logic-constructor`'s `resolveIfBranches` uses (branch selection is
 * positional, not part of node `data`). */
export const resolveIfBranches = (node: INode): IIfBranches => {
  const [first, second] = node.children ?? [];
  const trueOnRight = node.meta?.trueOnRight === true;
  return trueOnRight ? { thenChild: second, elseChild: first } : { thenChild: first, elseChild: second };
};

export const dataOf = (node: INode | undefined): string => (typeof node?.data === 'string' ? node.data : '');

/** `while`'s "True" branch label is flipped by `meta.trueIsMain` — by default (absent/`false`) "True"
 * marks the back-edge (repeat the loop), so the raw condition compiles as-is. When `trueIsMain` is
 * `true`, "True" instead marks the main path down (exit the loop), so the condition must be negated
 * for the loop to keep repeating on "False" — same convention as `resolveIfBranches`'s
 * `meta.trueOnRight`, just for a loop's single condition; same helper, independently implemented, in
 * every `@falang/logic-constructor` `*-control-flow-emitters.ts` and `@falang/workflow-compiler`'s
 * `node-emitters.ts`. */
export const resolveWhileCondition = (data: string, node: INode): string => {
  const trueIsMain = node.meta?.trueIsMain === true;
  return trueIsMain ? `!(${data})` : data;
};
