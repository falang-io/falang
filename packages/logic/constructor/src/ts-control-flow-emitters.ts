import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileTsExpr } from './compile-ts-expr.js';
import { indentLines } from './indent.js';
import { variableInfoToTsTypeName } from './ts-type-name.js';
import { resolveTsArrayType } from './ts-array-type.js';
import {
  appendOut,
  nextLoopLabel,
  nextTempName,
  type ITsStatementContext,
  type TCompileChildren,
} from './ts-statement-context.js';

/** A loop-variable's DSL type only ever matters for `variableInfoToTsTypeName`, which collapses every `numberType` detail to the same `number` — the exact width here is never observed. */
const NUMBER_TYPE: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

interface IIfBranches {
  readonly thenChild?: INode;
  readonly elseChild?: INode;
}

/** `if` always has 2 `if-child` positions; first = "then"/second = "else" by default, flipped by `meta.trueOnRight` — same convention as `go-control-flow-emitters.ts`'s own `resolveIfBranches`. */
const resolveIfBranches = (node: INode): IIfBranches => {
  const [first, second] = node.children ?? [];
  const trueOnRight = node.meta?.trueOnRight === true;
  return trueOnRight ? { thenChild: second, elseChild: first } : { thenChild: first, elseChild: second };
};

export const emitIf = (node: INode, ctx: ITsStatementContext, compile: TCompileChildren): string => {
  const condition = compileTsExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const { thenChild, elseChild } = resolveIfBranches(node);
  const thenBody = compile(thenChild ? appendOut(thenChild) : []);
  const elseBody = compile(elseChild ? appendOut(elseChild) : []);
  const elseBlock = elseBody === '' ? '' : ` else {\n${indentLines(elseBody)}\n}`;
  return `if (${condition}) {\n${indentLines(thenBody)}\n}${elseBlock}`;
};

/** Same literal sentinel convention as `go-control-flow-emitters.ts`'s own `DEFAULT_CASE_VALUE`. */
const DEFAULT_CASE_VALUE = 'default';

/**
 * Unlike Go (no fallthrough by default), TS/JS `switch` falls through like C++ — every case body is
 * wrapped in its own `{ }` block (so two cases can each declare a same-named local without colliding,
 * the same reason `cpp-control-flow-emitters.ts`'s `emitSwitch` needs one) and always ends with a bare,
 * *unlabeled* `break;` to prevent fallthrough into the next case. That bare break is safe specifically
 * because it's compiler-synthesized, never a DSL `break` node — a DSL `break`/`continue` always targets
 * an enclosing *loop* (`ts-leaf-emitters.ts`'s `emitBreak`/`emitContinue` always emit a labeled jump),
 * so unlike C++/C# (`cycle-info.ts`'s `_switch_break` bookkeeping), TS needs no extra machinery at all
 * to let a loop-targeting break/continue skip past this switch — a labeled `break L1;`/`continue L1;`
 * jumps straight past any number of intervening switches, the same real advantage Go/Rust already have.
 */
export const emitSwitch = (node: INode, ctx: ITsStatementContext, compile: TCompileChildren): string => {
  const discriminant = compileTsExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const cases = (node.children ?? [])
    .map((option) => {
      const optionData = option.data as string | undefined;
      const label =
        optionData === DEFAULT_CASE_VALUE ? 'default' : `case ${compileTsExpr(optionData ?? '', ctx, option.id)}`;
      const body = compile(appendOut(option));
      const bodyWithBreak = body === '' ? 'break;' : `${body}\nbreak;`;
      return `${label}: {\n${indentLines(bodyWithBreak)}\n}`;
    })
    .join('\n');
  return `switch (${discriminant}) {\n${indentLines(cases)}\n}`;
};

/**
 * Mints this loop's own label and, when a `bodyPrefix` is given (`emitForeach`'s own item declaration,
 * which the loop header itself can't express — see below), prepends it before compiling the body.
 * Otherwise the exact same "print the label only if it was actually referenced" shape as
 * `go-control-flow-emitters.ts`'s own `emitLabeledLoop`.
 */
const emitLabeledLoop = (
  ctx: ITsStatementContext,
  compile: TCompileChildren,
  bodyNodes: readonly INode[],
  scopeOverrides: Readonly<Record<string, TVariableInfo>>,
  buildHeader: () => string,
  bodyPrefix = '',
): string => {
  const label = nextLoopLabel(ctx);
  const nextLoopLabels = [...ctx.loopLabels, label];
  const body = compile(bodyNodes, { scopeOverrides, loopLabels: nextLoopLabels });
  const bodyParts = [bodyPrefix, body].filter((part) => part !== '');
  const block = `${buildHeader()} {\n${indentLines(bodyParts.join('\n'))}\n}`;
  return ctx.usedLabels.has(label) ? `${label}: ${block}` : block;
};

interface IForeachHeaderData {
  readonly arr: string;
  readonly item: string;
  readonly index: string;
}

/**
 * Unlike Go's native `for index, item := range arr`, this compiles to a manual counting loop
 * (`for (let i = 0; i < arr.length; i++) { let item: T = arr[i]; ... }`) — TS/JS's own `for...of` has
 * no built-in index, and using `.entries()` would need the same manual index-variable minting anyway.
 * An unused `index` field mints a synthetic, function-wide-unique name via `nextTempName` — unlike Go's
 * blank `_`, TS/JS has no discard identifier reusable across sibling loops in the same scope depth
 * without relying on each loop's own block scope, so a real unique name sidesteps that entirely.
 */
export const emitForeach = (node: INode, ctx: ITsStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IForeachHeaderData;
  const arrType = resolveTsArrayType(data.arr, ctx, node.id);
  const arr = compileTsExpr(data.arr, ctx, node.id);
  const item = data.item.trim();
  const indexName = data.index.trim();
  const indexVar = indexName === '' ? nextTempName(ctx, '__i') : indexName;
  const itemType = variableInfoToTsTypeName(arrType.elementType, ctx.params.structNames);
  const itemDeclaration = `let ${item}: ${itemType} = ${arr}[${indexVar}];`;
  const scopeOverrides = { [item]: arrType.elementType, [indexVar]: NUMBER_TYPE };
  return emitLabeledLoop(
    ctx,
    compile,
    appendOut(node),
    scopeOverrides,
    () => `for (let ${indexVar} = 0; ${indexVar} < ${arr}.length; ${indexVar}++)`,
    itemDeclaration,
  );
};

interface IFromToCycleHeaderData {
  readonly from: string;
  readonly to: string;
  readonly item: string;
}

/** No `int32(...)` cast wrapping needed here, unlike Go's own `emitFromToCycle` — TS has one numeric type, so `let item = ${from}` never has a "wrong inferred width" problem to guard against. */
export const emitFromToCycle = (node: INode, ctx: ITsStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IFromToCycleHeaderData;
  const from = compileTsExpr(data.from, ctx, node.id);
  const to = compileTsExpr(data.to, ctx, node.id);
  const item = data.item.trim();
  return emitLabeledLoop(
    ctx,
    compile,
    appendOut(node),
    { [item]: NUMBER_TYPE },
    () => `for (let ${item} = ${from}; ${item} <= ${to}; ${item}++)`,
  );
};

/**
 * `while`'s "True" branch label is flipped by `meta.trueIsMain` — see `cpp-control-flow-emitters.ts`'s
 * own `resolveWhileCondition` for the full rationale (default: condition as-is; `true`: negated, so
 * the loop keeps repeating on "False" once "True" means "exit").
 */
const resolveWhileCondition = (condition: string, node: INode): string => {
  const trueIsMain = node.meta?.trueIsMain === true;
  return trueIsMain ? `!(${condition})` : condition;
};

export const emitWhile = (node: INode, ctx: ITsStatementContext, compile: TCompileChildren): string => {
  const condition = resolveWhileCondition(compileTsExpr((node.data as string | undefined) ?? '', ctx, node.id), node);
  return emitLabeledLoop(ctx, compile, appendOut(node), {}, () => `while (${condition})`);
};

/** "Run once unless explicitly repeated" — same shape as `go-control-flow-emitters.ts`'s own `emitPseudoCycle`: an unconditional infinite loop with a compiler-synthesized trailing `break;`, so a nested `continue` targeting this loop's own label re-runs the body from the top instead of falling through the trailing break. */
export const emitPseudoCycle = (node: INode, ctx: ITsStatementContext, compile: TCompileChildren): string => {
  const label = nextLoopLabel(ctx);
  const nextLoopLabels = [...ctx.loopLabels, label];
  const body = compile(appendOut(node), { loopLabels: nextLoopLabels });
  const content = body === '' ? 'break;' : `${body}\nbreak;`;
  const block = `for (;;) {\n${indentLines(content)}\n}`;
  return ctx.usedLabels.has(label) ? `${label}: ${block}` : block;
};
