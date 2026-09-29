import type { INode } from '@falang/dto';
import { NodeCompileError } from './node-compile-error.js';
/**
 * A `switch` frame breaks a native `break;`'s reach to an outer loop in any target language without
 * labeled break/continue — C++ and C# both (unlike TS/Go/Rust, which have real loop labels, see
 * `go-statement-context.ts`). Tracked alongside `loop` frames so `crossesSwitchToTarget` can tell
 * whether a given `break`/`continue`'s native jump would actually land on its intended target.
 */
export type TNestingFrame = 'loop' | 'switch';

export interface ICycleInfo {
  readonly hasBreaks: boolean;
  readonly hasContinues: boolean;
  readonly hasSwitchBreaks: boolean;
}

/** Loop node kinds `break`/`continue` can target — matches `@falang/workflow-compiler`'s own `LOOP_EMITTERS` keys. */
export const LOOP_NODE_NAMES = new Set(['foreach', 'from-to-cycle', 'while', 'pseudo-cycle']);

export const outLevelOf = (node: INode): number => {
  const outLevel = node.meta?.outLevel;
  return typeof outLevel === 'number' ? outLevel : 1;
};

/** Whether a `break`/`continue` at `outLevel` (relative to `nesting`'s `loop` frames only — a `switch` frame doesn't count as a level) crosses a `switch` frame before reaching its target loop — the exact case a native C++ `break;` can't reach through, since C++ (unlike TS) has no labeled break/continue and a `switch` "eats" a bare `break`. */
export const crossesSwitchToTarget = (nesting: readonly TNestingFrame[], outLevel: number, nodeId: string): boolean => {
  const loopIndices: number[] = [];
  nesting.forEach((frame, index) => {
    if (frame === 'loop') loopIndices.push(index);
  });
  if (outLevel > loopIndices.length) {
    throw new NodeCompileError(nodeId, `Targets a loop level ${outLevel} that doesn't exist`);
  }
  const targetIndex = loopIndices[loopIndices.length - outLevel];
  return nesting.slice(targetIndex + 1).includes('switch');
};

const visitOutForCycleInfo = (
  out: INode | undefined,
  nesting: readonly TNestingFrame[],
  info: { hasBreaks: boolean; hasContinues: boolean; hasSwitchBreaks: boolean },
): void => {
  if (!out) return;
  if (out.name === 'break') {
    info.hasBreaks = true;
    if (crossesSwitchToTarget(nesting, outLevelOf(out), out.id)) info.hasSwitchBreaks = true;
  }
  if (out.name === 'continue') {
    info.hasContinues = true;
    const outLevel = outLevelOf(out);
    if (outLevel > 1 && crossesSwitchToTarget(nesting, outLevel, out.id)) info.hasSwitchBreaks = true;
  }
};

const collectCycleInfoFromNodes = (
  nodes: readonly INode[],
  nesting: readonly TNestingFrame[],
  info: { hasBreaks: boolean; hasContinues: boolean; hasSwitchBreaks: boolean },
): void => {
  for (const node of nodes) {
    if (node.name === 'if') {
      const [first, second] = node.children ?? [];
      for (const branch of [first, second]) {
        if (!branch) continue;
        collectCycleInfoFromNodes(branch.children ?? [], nesting, info);
        visitOutForCycleInfo(branch.out, nesting, info);
      }
      continue;
    }
    if (node.name === 'switch') {
      const nextNesting = [...nesting, 'switch' as const];
      for (const option of node.children ?? []) {
        collectCycleInfoFromNodes(option.children ?? [], nextNesting, info);
        visitOutForCycleInfo(option.out, nextNesting, info);
      }
      continue;
    }
    if (LOOP_NODE_NAMES.has(node.name)) {
      const nextNesting = [...nesting, 'loop' as const];
      collectCycleInfoFromNodes(node.children ?? [], nextNesting, info);
      visitOutForCycleInfo(node.out, nextNesting, info);
    }
  }
};

/**
 * Pre-pass over a function body (same recursive shape as the real compile pass in
 * `compile-cpp-statements.ts`/`compile-sharp-statements.ts`, but gathering flags instead of emitting code) — determines which of
 * the `_break_level`/`_continue_level`/`_switch_break` bookkeeping variables the compiled function
 * actually needs (see `compile-cpp-function.ts`). Mirrors old `getCycleCompileInfo`'s role, computed
 * here via a single nesting-stack pass instead of parent-pointer walks (this DTO's `INode` has no
 * parent pointer, unlike the old icon-tree model `getCycleCompileInfo`/`hasParentCycle` walked).
 */
export const computeCycleInfo = (bodyNodes: readonly INode[]): ICycleInfo => {
  const info = { hasBreaks: false, hasContinues: false, hasSwitchBreaks: false };
  collectCycleInfoFromNodes(bodyNodes, [], info);
  return info;
};
