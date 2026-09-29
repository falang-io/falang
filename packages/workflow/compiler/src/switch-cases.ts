import type { INode } from '@falang/dto';
import { indentLines } from './indent.js';

/** Compiles a list of (potentially nested) statement nodes back into TypeScript source. */
export type TCompileChildren = (nodes: readonly INode[]) => string;

/**
 * Appends a `haveOut: true` container's trailing `.out` node (`break`/`continue`/`throw`/`return`) to
 * its `children`, if one is set — the editor persists that trailing jump separately via `.out`
 * (`set-out-node.ts`), never as a `children` entry, so every block-compiling emitter must go through
 * this rather than reading `node.children` directly or the jump is silently dropped.
 */
export const appendOut = (node: INode): readonly INode[] =>
  node.out ? [...(node.children ?? []), node.out] : (node.children ?? []);

/**
 * One case per option, its own block scope, automatic trailing `break;` (no fallthrough).
 * `buildCasePrefix` (used by `choice-emitters.ts`'s `const data = ...;` binding, and
 * `question-emitters.ts`'s `answerScope.perOptionData` prelude) is prepended to the compiled body
 * when it returns one — `undefined` (never called at all, or called but returning nothing for this
 * particular option, e.g. a `void`-typed option) is treated the same as omitting it entirely. Shared
 * by `node-emitters.ts`'s `emitSwitch`, `question-emitters.ts`, and `choice-emitters.ts` — all three
 * compile the same "one case per child, discriminant → branch" shape.
 */
export const buildSwitchCases = (
  options: readonly INode[],
  compile: TCompileChildren,
  getCaseValue: (option: INode) => string,
  buildCasePrefix?: (option: INode) => string | undefined,
): string =>
  options
    .map((option) => {
      const value = getCaseValue(option);
      const prefix = buildCasePrefix?.(option);
      const body = compile(appendOut(option));
      const combined = [prefix, body].filter(Boolean).join('\n');
      const caseContent = combined === '' ? 'break;' : `${combined}\nbreak;`;
      return `case ${value}: {\n${indentLines(caseContent)}\n}`;
    })
    .join('\n');
