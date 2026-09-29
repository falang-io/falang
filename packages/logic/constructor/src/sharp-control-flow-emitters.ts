import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileSharpExpr } from './compile-sharp-expr.js';
import { variableInfoToSharpType } from './sharp-type-name.js';
import { copySharpValue } from './sharp-value.js';
import { indentLines } from './indent.js';
import { appendOut, type ISharpStatementContext, type TCompileChildren } from './sharp-statement-context.js';

const INT32_TYPE: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

interface IIfBranches {
  readonly thenChild?: INode;
  readonly elseChild?: INode;
}

/** Same positional convention as every other target's own `resolveIfBranches` — first child is "then", flipped by `meta.trueOnRight`. */
const resolveIfBranches = (node: INode): IIfBranches => {
  const [first, second] = node.children ?? [];
  const trueOnRight = node.meta?.trueOnRight === true;
  return trueOnRight ? { thenChild: second, elseChild: first } : { thenChild: first, elseChild: second };
};

export const emitIf = (node: INode, ctx: ISharpStatementContext, compile: TCompileChildren): string => {
  const condition = compileSharpExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const { thenChild, elseChild } = resolveIfBranches(node);
  const thenBody = compile(thenChild ? appendOut(thenChild) : []);
  const elseBody = compile(elseChild ? appendOut(elseChild) : []);
  const elseBlock = elseBody === '' ? '' : ` else {\n${indentLines(elseBody)}\n}`;
  return `if (${condition}) {\n${indentLines(thenBody)}\n}${elseBlock}`;
};

/** Same sentinel convention every other target uses — a `switch-option` whose `data` is exactly `default` compiles to a bare `default:` label, checked *before* running the text through `compileSharpExpr` (`default` is a reserved word, not a valid expression). */
const DEFAULT_CASE_VALUE = 'default';

/**
 * C# is stricter than C++ here: a non-empty `switch` section **must** end in a jump statement
 * ("control cannot fall through from one case label to another", CS0163) — so the appended `break;`
 * isn't merely fallthrough prevention as it is for cpp, it's mandatory. Skipped only when the body
 * already ends in a native `break;` of its own (a `switch-option` whose `.out` is a `break` node),
 * detected by stripping the one trailing `// icon-end:break:<id>` `wrapMarker` comment line first —
 * same check, and same reason it can't be a naive `endsWith`, as `cpp-control-flow-emitters.ts`'s own
 * `buildCaseContent`.
 */
const buildCaseContent = (body: string): string => {
  if (body === '') return 'break;';
  const bodyEndsInBreakStatement = body.replace(/\n\/\/ icon-end:break:[^\n]*$/, '').endsWith('break;');
  return bodyEndsInBreakStatement ? body : `${body}\nbreak;`;
};

export const emitSwitch = (node: INode, ctx: ISharpStatementContext, compile: TCompileChildren): string => {
  const discriminant = compileSharpExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const cases = (node.children ?? [])
    .map((option) => {
      const optionData = option.data as string | undefined;
      const label =
        optionData === DEFAULT_CASE_VALUE ? 'default' : `case ${compileSharpExpr(optionData ?? '', ctx, option.id)}`;
      const body = compile(appendOut(option), { nesting: [...ctx.nesting, 'switch'] });
      return `${label}: {\n${indentLines(buildCaseContent(body))}\n}`;
    })
    .join('\n');
  const resetSwitchBreak = ctx.cycleInfo.hasSwitchBreaks ? '_switch_break = false;\n' : '';
  // Emitted right after the switch's own closing brace, so a `break` that could only reach this
  // switch natively still propagates out to its real target loop — same mechanism (and same
  // "any enclosing loop, not just an immediate one" condition) as the cpp target.
  const propagate =
    ctx.cycleInfo.hasSwitchBreaks && ctx.nesting.includes('loop') ? '\nif (_switch_break) { break; }' : '';
  return `${resetSwitchBreak}switch (${discriminant}) {\n${indentLines(cases)}\n}${propagate}`;
};

/** Emitted right after a loop's own closing brace when that loop is itself nested inside another loop — propagates a still-positive `_break_level`/`_continue_level` one level further out. Direct port of the cpp target's own `buildCycleBottomInfo` (and of old `sharpLogicIconsBuilder.ts`'s `writeCycleBottomInfo`, which emits the identical lines). */
const buildCycleBottomInfo = (ctxBeforeLoop: ISharpStatementContext): string => {
  if (!ctxBeforeLoop.nesting.includes('loop')) return '';
  const breakLines = ctxBeforeLoop.cycleInfo.hasBreaks ? ['if (_break_level > 0) { _break_level--; break; }'] : [];
  const continueLines = ctxBeforeLoop.cycleInfo.hasContinues
    ? [
        'if (_continue_level > 1) { _continue_level--; break; }',
        'if (_continue_level == 1) { _continue_level--; continue; }',
      ]
    : [];
  return [...breakLines, ...continueLines].join('\n');
};

const appendCycleBottom = (block: string, ctxBeforeLoop: ISharpStatementContext): string => {
  const bottom = buildCycleBottomInfo(ctxBeforeLoop);
  return bottom === '' ? block : `${block}\n${bottom}`;
};

interface IForeachHeaderData {
  readonly arr: string;
  readonly item: string;
  readonly index: string;
}

/**
 * An index-based `for` over `.Count` rather than C#'s own `foreach (var item in arr)` — the DSL's
 * `index` field needs a real loop counter, and `item` has to be an independent copy (C# binds a
 * `foreach` variable to the list's own element, so mutating `item` inside the body would mutate the
 * list for a struct element type, unlike C++'s copy). `copySharpValue` gives the same per-iteration
 * copy Rust's `emitForeach` needed a `.clone()` for.
 */
export const emitForeach = (node: INode, ctx: ISharpStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IForeachHeaderData;
  const arrType = ctx.scope[data.arr.trim()];
  if (!arrType || arrType.type !== 'array') {
    throw new Error(`"${data.arr}" must be a plain array-typed identifier already in scope for C# compilation`);
  }
  const arr = compileSharpExpr(data.arr, ctx, node.id);
  const item = data.item.trim();
  const index = data.index.trim() === '' ? `${item}_index` : data.index.trim();
  const body = compile(appendOut(node), {
    scopeOverrides: { [item]: arrType.elementType, [index]: INT32_TYPE },
    nesting: [...ctx.nesting, 'loop'],
  });
  const elementSharpType = variableInfoToSharpType(arrType.elementType, ctx.params.structNames);
  const itemValue = copySharpValue(`${arr}[${index}]`, arrType.elementType, ctx.params.structNames);
  const itemDeclaration = `${elementSharpType} ${item} = ${itemValue};`;
  const forBlock = `for (int ${index} = 0; ${index} < ${arr}.Count; ${index}++) {\n${indentLines(`${itemDeclaration}\n${body}`)}\n}`;
  return appendCycleBottom(forBlock, ctx);
};

interface IFromToCycleHeaderData {
  readonly from: string;
  readonly to: string;
  readonly item: string;
}

export const emitFromToCycle = (node: INode, ctx: ISharpStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IFromToCycleHeaderData;
  const from = compileSharpExpr(data.from, ctx, node.id);
  const to = compileSharpExpr(data.to, ctx, node.id);
  const item = data.item.trim();
  const body = compile(appendOut(node), { scopeOverrides: { [item]: INT32_TYPE }, nesting: [...ctx.nesting, 'loop'] });
  const forBlock = `for (int ${item} = ${from}; ${item} <= ${to}; ${item}++) {\n${indentLines(body)}\n}`;
  return appendCycleBottom(forBlock, ctx);
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

export const emitWhile = (node: INode, ctx: ISharpStatementContext, compile: TCompileChildren): string => {
  const condition = resolveWhileCondition(
    compileSharpExpr((node.data as string | undefined) ?? '', ctx, node.id),
    node,
  );
  const body = compile(appendOut(node), { nesting: [...ctx.nesting, 'loop'] });
  const whileBlock = `while (${condition}) {\n${indentLines(body)}\n}`;
  return appendCycleBottom(whileBlock, ctx);
};

/** "Run once unless explicitly repeated" — same `while (true) { ...; break; }` shape as every other target's own `emitPseudoCycle`. */
export const emitPseudoCycle = (node: INode, ctx: ISharpStatementContext, compile: TCompileChildren): string => {
  const body = compile(appendOut(node), { nesting: [...ctx.nesting, 'loop'] });
  const content = body === '' ? 'break;' : `${body}\nbreak;`;
  const whileBlock = `while (true) {\n${indentLines(content)}\n}`;
  return appendCycleBottom(whileBlock, ctx);
};
