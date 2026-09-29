import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileGoExpr } from './compile-go-expr.js';
import { indentLines } from './indent.js';
import { appendOut, type IGoStatementContext, type TCompileChildren } from './go-statement-context.js';

const INT32_TYPE: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

interface IIfBranches {
  readonly thenChild?: INode;
  readonly elseChild?: INode;
}

/** `if` always has 2 `if-child` positions; first = "then"/second = "else" by default, flipped by `meta.trueOnRight` — same convention as `cpp-control-flow-emitters.ts`'s own `resolveIfBranches`. */
const resolveIfBranches = (node: INode): IIfBranches => {
  const [first, second] = node.children ?? [];
  const trueOnRight = node.meta?.trueOnRight === true;
  return trueOnRight ? { thenChild: second, elseChild: first } : { thenChild: first, elseChild: second };
};

/** Go's `if`/`for`/`switch` never parenthesize their condition (unlike C++) — the mandatory same-line opening brace (Go's automatic-semicolon-insertion rule) is the only syntax constraint that matters here, and this codebase's existing `{ ... }` block-emission style already satisfies it. */
export const emitIf = (node: INode, ctx: IGoStatementContext, compile: TCompileChildren): string => {
  const condition = compileGoExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const { thenChild, elseChild } = resolveIfBranches(node);
  const thenBody = compile(thenChild ? appendOut(thenChild) : []);
  const elseBody = compile(elseChild ? appendOut(elseChild) : []);
  const elseBlock = elseBody === '' ? '' : ` else {\n${indentLines(elseBody)}\n}`;
  return `if ${condition} {\n${indentLines(thenBody)}\n}${elseBlock}`;
};

/** Same literal sentinel convention as `cpp-control-flow-emitters.ts`'s `DEFAULT_CASE_VALUE`. */
const DEFAULT_CASE_VALUE = 'default';

/**
 * Go's `switch` doesn't fall through by default (the opposite of C++/JS — each `case` implicitly
 * breaks after its own statements, `fallthrough` is a separate explicit keyword this DSL never emits)
 * — so, unlike `cpp-control-flow-emitters.ts`'s `emitSwitch`, no per-case fallthrough-preventing
 * `break;` ever needs appending. Each `case`/`default` clause also implicitly acts as its own block
 * per the Go spec, so case bodies need no explicit `{ }` wrapper either (unlike C++, which needs one
 * for variable scoping). A DSL `break` node inside a case still compiles normally through
 * `go-leaf-emitters.ts`'s `emitBreak` when present — it targets an *enclosing loop* via a label, a
 * concern entirely separate from switch fallthrough.
 */
export const emitSwitch = (node: INode, ctx: IGoStatementContext, compile: TCompileChildren): string => {
  const discriminant = compileGoExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const cases = (node.children ?? [])
    .map((option) => {
      const optionData = option.data as string | undefined;
      const label =
        optionData === DEFAULT_CASE_VALUE ? 'default' : `case ${compileGoExpr(optionData ?? '', ctx, option.id)}`;
      const body = compile(appendOut(option));
      return body === '' ? `${label}:` : `${label}:\n${indentLines(body)}`;
    })
    .join('\n');
  return `switch ${discriminant} {\n${indentLines(cases)}\n}`;
};

/**
 * Mints this loop's own label from the shared, function-wide `labelCounter` — not from
 * `loopLabels.length` (nesting depth), which would hand the same `L<n>` name to two loops sitting at
 * the same depth in different branches (e.g. two `from-to-cycle`s in different `switch-option`s, or
 * two sequential top-level loops) — see `go-statement-context.ts`'s own doc comment on `labelCounter`.
 */
const nextLoopLabel = (ctx: IGoStatementContext): string => {
  ctx.labelCounter.value += 1;
  return `L${ctx.labelCounter.value}`;
};

/** Assigns this loop the next label and only prints the `L<n>: ` prefix if `ctx.usedLabels` ends up containing it after compiling the body — an unused Go label is a compile error, so a loop with no `break`/`continue` targeting it (directly or through a nested construct) must stay unlabeled. */
const emitLabeledLoop = (
  ctx: IGoStatementContext,
  compile: TCompileChildren,
  bodyNodes: readonly INode[],
  scopeOverrides: Readonly<Record<string, TVariableInfo>>,
  buildHeader: (label: string) => string,
): string => {
  const label = nextLoopLabel(ctx);
  const nextLoopLabels = [...ctx.loopLabels, label];
  const body = compile(bodyNodes, { scopeOverrides, loopLabels: nextLoopLabels });
  const block = `${buildHeader(label)} {\n${indentLines(body)}\n}`;
  return ctx.usedLabels.has(label) ? `${label}: ${block}` : block;
};

interface IForeachHeaderData {
  readonly arr: string;
  readonly item: string;
  readonly index: string;
}

/** Go's native `for index, item := range arr` replaces cpp's manual index-based loop entirely — no separate index-counter declaration or element-lookup statement needed. An unused index name becomes the blank identifier `_` (Go rejects an unused named variable, but never flags `_`). */
export const emitForeach = (node: INode, ctx: IGoStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IForeachHeaderData;
  const arrType = ctx.scope[data.arr.trim()];
  if (!arrType || arrType.type !== 'array') {
    throw new Error(`"${data.arr}" must be a plain array-typed identifier already in scope for Go compilation`);
  }
  const arr = compileGoExpr(data.arr, ctx, node.id);
  const item = data.item.trim();
  const indexName = data.index.trim();
  const indexVar = indexName === '' ? '_' : indexName;
  const scopeOverrides =
    indexName === '' ? { [item]: arrType.elementType } : { [item]: arrType.elementType, [indexName]: INT32_TYPE };
  return emitLabeledLoop(
    ctx,
    compile,
    appendOut(node),
    scopeOverrides,
    () => `for ${indexVar}, ${item} := range ${arr}`,
  );
};

interface IFromToCycleHeaderData {
  readonly from: string;
  readonly to: string;
  readonly item: string;
}

/**
 * `int32(...)` wraps both bounds explicitly — `from-to-cycle`'s loop variable is always `int32` per
 * `ctx.scope`'s own `INT32_TYPE` (used for compiling the loop body's expressions), but Go's `:=`
 * infers a *plain* `int` from an untyped integer literal (`from ${item} := 0; ...` would give `item`
 * type `int`, not `int32`) — a real gap only found by actually running the compiled Go, not by unit
 * tests: `arrays`' `RunTestObjects` (`obj.X = index` assigning the loop var into an `int32` struct
 * field) and `conditions`' `TestReturn` (`return x + y` from an `int32`-returning function) both hit
 * "cannot use ... (value of type int) as int32 value" without this. `int32(...)` is a safe no-op even
 * when `from`/`to` already evaluate to `int32` (an identity conversion), so this doesn't need to know
 * which case it's in.
 */
export const emitFromToCycle = (node: INode, ctx: IGoStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IFromToCycleHeaderData;
  const from = compileGoExpr(data.from, ctx, node.id);
  const to = compileGoExpr(data.to, ctx, node.id);
  const item = data.item.trim();
  return emitLabeledLoop(
    ctx,
    compile,
    appendOut(node),
    { [item]: INT32_TYPE },
    () => `for ${item} := int32(${from}); ${item} <= int32(${to}); ${item}++`,
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

/** Go has no `while` keyword — a `for` with only a condition (no init/post clauses) is Go's while-equivalent. */
export const emitWhile = (node: INode, ctx: IGoStatementContext, compile: TCompileChildren): string => {
  const condition = resolveWhileCondition(compileGoExpr((node.data as string | undefined) ?? '', ctx, node.id), node);
  return emitLabeledLoop(ctx, compile, appendOut(node), {}, () => `for ${condition}`);
};

/** "Run once unless explicitly repeated" — Go's unconditional infinite loop is a bare `for` with no clauses at all. The trailing `break;` this always appends is a compiler-synthesized bare break (targets this loop directly, not through the label mechanism) — same shape as `cpp-control-flow-emitters.ts`'s own `emitPseudoCycle`. */
export const emitPseudoCycle = (node: INode, ctx: IGoStatementContext, compile: TCompileChildren): string => {
  const label = nextLoopLabel(ctx);
  const nextLoopLabels = [...ctx.loopLabels, label];
  const body = compile(appendOut(node), { loopLabels: nextLoopLabels });
  const content = body === '' ? 'break;' : `${body}\nbreak;`;
  const block = `for {\n${indentLines(content)}\n}`;
  return ctx.usedLabels.has(label) ? `${label}: ${block}` : block;
};
