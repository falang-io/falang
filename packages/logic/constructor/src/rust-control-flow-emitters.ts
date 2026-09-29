import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileRustExpr } from './compile-rust-expr.js';
import { variableInfoToRustType } from './rust-type-name.js';
import { indentLines } from './indent.js';
import {
  appendOut,
  resolveRustArrayType,
  type IRustStatementContext,
  type TCompileChildren,
} from './rust-statement-context.js';

const INT32_TYPE: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

interface IIfBranches {
  readonly thenChild?: INode;
  readonly elseChild?: INode;
}

/** `if` always has 2 `if-child` positions; first = "then"/second = "else" by default, flipped by `meta.trueOnRight` — same convention as `cpp-control-flow-emitters.ts`'s/`go-control-flow-emitters.ts`'s own `resolveIfBranches`. */
const resolveIfBranches = (node: INode): IIfBranches => {
  const [first, second] = node.children ?? [];
  const trueOnRight = node.meta?.trueOnRight === true;
  return trueOnRight ? { thenChild: second, elseChild: first } : { thenChild: first, elseChild: second };
};

/** Rust's `if`/`while`/`match` never parenthesize their condition/scrutinee (like Go, unlike C++) — the mandatory same-line opening brace is the only real syntax constraint, already satisfied by this codebase's existing `{ ... }` block-emission style. */
export const emitIf = (node: INode, ctx: IRustStatementContext, compile: TCompileChildren): string => {
  const condition = compileRustExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const { thenChild, elseChild } = resolveIfBranches(node);
  const thenBody = compile(thenChild ? appendOut(thenChild) : []);
  const elseBody = compile(elseChild ? appendOut(elseChild) : []);
  const elseBlock = elseBody === '' ? '' : ` else {\n${indentLines(elseBody)}\n}`;
  return `if ${condition} {\n${indentLines(thenBody)}\n}${elseBlock}`;
};

/** Same literal sentinel convention as `cpp-control-flow-emitters.ts`'s/`go-control-flow-emitters.ts`'s `DEFAULT_CASE_VALUE`. */
const DEFAULT_CASE_VALUE = 'default';

/**
 * Rust's `match` — unlike both C++'s `switch` and Go's `switch` — must be *exhaustive*: a `match` over
 * an arbitrary-width integer (or any other non-enum type) with no wildcard arm is a hard compile error
 * ("non-exhaustive patterns"), even though neither of this DSL's other two targets need one at all. A
 * `switch-option` whose `data` is the `"default"` sentinel still maps to Rust's own wildcard pattern
 * `_`, same as it maps to `default:`/`default:` there — but when the DSL gives *no* such option (a
 * completely ordinary, valid switch in both C++ and Go), this appends a synthesized `_ => {},` arm so
 * the match still compiles; no fallthrough handling is needed either (Rust match arms never fall
 * through, same as Go's `switch`).
 *
 * A second, real Rust-specific gap found only by actually running the compiled output (`conditions`'
 * `TestNestedSwitch`, whose `switch-option`s list `default` *first*, matching the old app's own
 * document order): Rust `match` arms are evaluated top-to-bottom and the first matching pattern wins —
 * unlike a C++/Go `switch`, where `default` never "shadows" an earlier-appearing `case` regardless of
 * where it's textually written, in Rust a `_` wildcard arm placed *before* `0 => ...`/`1 => ...` swallows
 * every value and makes those later arms dead code, with no compiler warning (the "unreachable pattern"
 * lint doesn't fire for this shape). The wildcard/default arm is therefore always emitted *last*,
 * regardless of the DSL's own child order — the one place this compiler must actively reorder its input
 * rather than translate it positionally, because Rust (alone among this DSL's three targets) attaches
 * meaning to match-arm order.
 */
export const emitSwitch = (node: INode, ctx: IRustStatementContext, compile: TCompileChildren): string => {
  const discriminant = compileRustExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const specificArms: string[] = [];
  let defaultArm: string | null = null;
  for (const option of node.children ?? []) {
    const optionData = option.data as string | undefined;
    const isDefault = optionData === DEFAULT_CASE_VALUE;
    const pattern = isDefault ? '_' : compileRustExpr(optionData ?? '', ctx, option.id);
    const body = compile(appendOut(option));
    const arm = body === '' ? `${pattern} => {},` : `${pattern} => {\n${indentLines(body)}\n},`;
    if (isDefault) defaultArm = arm;
    else specificArms.push(arm);
  }
  const arms = [...specificArms, defaultArm ?? '_ => {},'];
  return `match ${discriminant} {\n${indentLines(arms.join('\n'))}\n}`;
};

/**
 * Mints this loop's own label from a shared, function-wide `labelCounter` — a direct, low-risk port of
 * `go-control-flow-emitters.ts`'s `nextLoopLabel`. See `rust-statement-context.ts`'s own doc comment on
 * why this codebase doesn't rely on Rust's (looser than Go's) lexical label-scoping rules instead.
 */
const nextLoopLabel = (ctx: IRustStatementContext): string => {
  ctx.labelCounter.value += 1;
  return `L${ctx.labelCounter.value}`;
};

/** Assigns this loop the next label and only prints the `'L<n>: ` prefix if `ctx.usedLabels` ends up containing it after compiling the body — an unused Rust label is only a lint warning (`unused_labels`), not a compile error (unlike Go), but omitting it when possible keeps generated code as close to what a human would write as the always-labeled alternative. `bodyPrelude`, when given, is prepended to the compiled body before indenting — used only by `emitForeach`'s per-iteration item binding. */
const emitLabeledLoop = (
  ctx: IRustStatementContext,
  compile: TCompileChildren,
  bodyNodes: readonly INode[],
  scopeOverrides: Readonly<Record<string, TVariableInfo>>,
  buildHeader: () => string,
  bodyPrelude = '',
): string => {
  const label = nextLoopLabel(ctx);
  const nextLoopLabels = [...ctx.loopLabels, label];
  const body = compile(bodyNodes, { scopeOverrides, loopLabels: nextLoopLabels });
  const fullBody = [bodyPrelude, body].filter((part) => part !== '').join('\n');
  const block = `${buildHeader()} {\n${indentLines(fullBody)}\n}`;
  return ctx.usedLabels.has(label) ? `'${label}: ${block}` : block;
};

interface IForeachHeaderData {
  readonly arr: string;
  readonly item: string;
  readonly index: string;
}

/**
 * Rust's own `for x in arr.iter()` would bind `item` as a *reference* (`&T`), not the owned value this
 * DSL's `item` scope entry (`arrType.elementType`) represents — an index-based loop with an explicit
 * `.clone()` per iteration instead reproduces the exact "fresh owned local copy" semantics
 * `cpp-control-flow-emitters.ts`'s own `T item = arr[index];` already established (and this needs to
 * work uniformly for both `Copy` element types like `i32`, where `.clone()` is just a copy, and
 * non-`Copy` ones like a struct array's elements). An empty `data.index` synthesizes `${item}_index`,
 * same convention as the cpp target (Rust tolerates an unused-but-named loop variable as a mere
 * `unused_variables` warning, so — unlike Go — there's no need for a `_` blank-identifier special case
 * here). `data.arr` is resolved via `resolveRustArrayType` (not a bare `ctx.scope` lookup) so a
 * property-path expression like `state.snake.body` — a real, load-bearing shape in the user's own
 * `example-snake` project — works here too, not just a plain identifier (see that function's own doc
 * comment in `rust-statement-context.ts`).
 */
export const emitForeach = (node: INode, ctx: IRustStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IForeachHeaderData;
  const arrType = resolveRustArrayType(data.arr, ctx, node.id);
  const arr = compileRustExpr(data.arr, ctx, node.id);
  const item = data.item.trim();
  const indexName = data.index.trim() === '' ? `${item}_index` : data.index.trim();
  const rustType = variableInfoToRustType(arrType.elementType, ctx.params.structNames, ctx.params.structDocuments);
  const itemDeclaration = `let mut ${item}: ${rustType} = ${arr}[${indexName} as usize].clone();`;
  return emitLabeledLoop(
    ctx,
    compile,
    appendOut(node),
    { [item]: arrType.elementType, [indexName]: INT32_TYPE },
    () => `for ${indexName} in 0..${arr}.len() as i32`,
    itemDeclaration,
  );
};

interface IFromToCycleHeaderData {
  readonly from: string;
  readonly to: string;
  readonly item: string;
}

/**
 * Rust's inclusive range syntax (`from..=to`) maps directly to this DSL's own inclusive
 * `from-to-cycle` — no separate "translate exclusive to inclusive" step cpp/Go never needed either
 * (see ADR 0019 (private)'s note on this compiler's `from-to-cycle` already being inclusive).
 * Both bounds are still explicitly cast to `i32` (`(from as i32)..=(to as i32)`) even though Rust's
 * own integer-literal type-inference default (unlike Go's plain `int`) already happens to be `i32` —
 * the same defensive insurance `go-control-flow-emitters.ts`'s `emitFromToCycle` needed for real after
 * a `for item := from; ...` loop variable came out a mismatched type, applied here pre-emptively so a
 * `from`/`to` expression of some *other* already-typed integer width (not just an untyped literal)
 * can't silently disagree with `ctx.scope`'s own `INT32_TYPE` assumption for the loop variable.
 */
export const emitFromToCycle = (node: INode, ctx: IRustStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IFromToCycleHeaderData;
  const from = compileRustExpr(data.from, ctx, node.id);
  const to = compileRustExpr(data.to, ctx, node.id);
  const item = data.item.trim();
  return emitLabeledLoop(
    ctx,
    compile,
    appendOut(node),
    { [item]: INT32_TYPE },
    () => `for ${item} in (${from} as i32)..=(${to} as i32)`,
  );
};

/**
 * `while`'s "True" branch label is flipped by `meta.trueIsMain` — see `cpp-control-flow-emitters.ts`'s
 * own `resolveWhileCondition` for the full rationale (default: condition as-is; `true`: negated, so
 * the loop keeps repeating on "False" once "True" means "exit"). Rust's `!(...)` boolean-not works
 * fine on an unparenthesized condition expression, same as every other target.
 */
const resolveWhileCondition = (condition: string, node: INode): string => {
  const trueIsMain = node.meta?.trueIsMain === true;
  return trueIsMain ? `!(${condition})` : condition;
};

/** Rust's native `while` keyword, unlike Go (which has none and must fake it with a condition-only `for`) — a direct, top-tested loop. */
export const emitWhile = (node: INode, ctx: IRustStatementContext, compile: TCompileChildren): string => {
  const condition = resolveWhileCondition(compileRustExpr((node.data as string | undefined) ?? '', ctx, node.id), node);
  return emitLabeledLoop(ctx, compile, appendOut(node), {}, () => `while ${condition}`);
};

/** "Run once unless explicitly repeated" — Rust's own unconditional-loop keyword (`loop`) replaces the `while (true)`/`for {}` idiom both other targets need. The trailing `break;` this always appends is a compiler-synthesized bare break (targets this loop directly, not through the label mechanism) — same shape as `go-control-flow-emitters.ts`'s own `emitPseudoCycle`. */
export const emitPseudoCycle = (node: INode, ctx: IRustStatementContext, compile: TCompileChildren): string => {
  const label = nextLoopLabel(ctx);
  const nextLoopLabels = [...ctx.loopLabels, label];
  const body = compile(appendOut(node), { loopLabels: nextLoopLabels });
  const content = body === '' ? 'break;' : `${body}\nbreak;`;
  const block = `loop {\n${indentLines(content)}\n}`;
  return ctx.usedLabels.has(label) ? `'${label}: ${block}` : block;
};
