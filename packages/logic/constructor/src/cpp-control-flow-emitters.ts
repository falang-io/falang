import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileExpr } from './compile-cpp-expr.js';
import { variableInfoToCppType } from './cpp-type-name.js';
import { indentLines } from './indent.js';
import { appendOut, type ICppStatementContext, type TCompileChildren } from './cpp-statement-context.js';

const INT32_TYPE: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

interface IIfBranches {
  readonly thenChild?: INode;
  readonly elseChild?: INode;
}

/** `if` always has 2 `if-child` positions; first = "then"/second = "else" by default, flipped by `meta.trueOnRight` — same convention `@falang/workflow-compiler`'s `resolveIfBranches` uses (branch selection is positional, not part of node `data`). */
const resolveIfBranches = (node: INode): IIfBranches => {
  const [first, second] = node.children ?? [];
  const trueOnRight = node.meta?.trueOnRight === true;
  return trueOnRight ? { thenChild: second, elseChild: first } : { thenChild: first, elseChild: second };
};

export const emitIf = (node: INode, ctx: ICppStatementContext, compile: TCompileChildren): string => {
  const condition = compileExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const { thenChild, elseChild } = resolveIfBranches(node);
  const thenBody = compile(thenChild ? appendOut(thenChild) : []);
  const elseBody = compile(elseChild ? appendOut(elseChild) : []);
  const elseBlock = elseBody === '' ? '' : ` else {\n${indentLines(elseBody)}\n}`;
  return `if (${condition}) {\n${indentLines(thenBody)}\n}${elseBlock}`;
};

/** A `switch-option` whose `data` is exactly this sentinel compiles to `default:` instead of `case <value>:` — the same literal convention the old app's own icon tree used (`"expression": "default"`, see `old/resources/test-projects/conditions`), ported as-is rather than inventing a new one. */
const DEFAULT_CASE_VALUE = 'default';

/**
 * A `break` `.out` directly on a switch-option already emits its own native `break;` as the body's
 * last statement — but `wrapMarker` wraps it in a trailing `// icon-end:break:<id>` comment line, so
 * this strips exactly that one trailing comment line before comparing. Appending another `break;`
 * after it would be harmless (dead code after an already-terminating statement) but redundant. A body
 * ending in some *other* construct — e.g. a nested loop whose own internal `_break_level` bookkeeping
 * happens to end in `break;` — still needs the fallthrough-preventing `break;` appended, since that
 * inner `break;` only exits the loop, not this `switch`.
 */
const buildCaseContent = (body: string): string => {
  if (body === '') return 'break;';
  const bodyEndsInBreakStatement = body.replace(/\n\/\/ icon-end:break:[^\n]*$/, '').endsWith('break;');
  return bodyEndsInBreakStatement ? body : `${body}\nbreak;`;
};

export const emitSwitch = (node: INode, ctx: ICppStatementContext, compile: TCompileChildren): string => {
  const discriminant = compileExpr((node.data as string | undefined) ?? '', ctx, node.id);
  const cases = (node.children ?? [])
    .map((option) => {
      const optionData = option.data as string | undefined;
      const label =
        optionData === DEFAULT_CASE_VALUE ? 'default' : `case ${compileExpr(optionData ?? '', ctx, option.id)}`;
      const body = compile(appendOut(option), { nesting: [...ctx.nesting, 'switch'] });
      const caseContent = buildCaseContent(body);
      return `${label}: {\n${indentLines(caseContent)}\n}`;
    })
    .join('\n');
  const resetSwitchBreak = ctx.cycleInfo.hasSwitchBreaks ? '_switch_break = false;\n' : '';
  // Emitted right after the switch's own closing brace (`hasParentCycle(icon)` in old codegen —
  // does the switch have *any* enclosing loop, not just an immediate one) so a break that could only
  // reach this switch natively still propagates out to the real target loop.
  const propagate =
    ctx.cycleInfo.hasSwitchBreaks && ctx.nesting.includes('loop') ? '\nif (_switch_break) { break; }' : '';
  return `${resetSwitchBreak}switch (${discriminant}) {\n${indentLines(cases)}\n}${propagate}`;
};

/** Emitted right after a loop's own closing brace, only when this loop is itself nested inside an outer loop (`ctx.nesting` — the nesting *before* this loop pushed its own frame — already contains a `loop` entry): propagates a still-positive `_break_level`/`_continue_level` counter one level further out, the mechanism a native C++ `break`/`continue` can't do on its own for `outLevel > 1`. Mirrors old `writeCycleBottomInfo`, called after `cb.closeQuote()` in every old per-language cpp/js/ts/sharp/golang/rust loop builder. */
const buildCycleBottomInfo = (ctxBeforeLoop: ICppStatementContext): string => {
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

const appendCycleBottom = (block: string, ctxBeforeLoop: ICppStatementContext): string => {
  const bottom = buildCycleBottomInfo(ctxBeforeLoop);
  return bottom === '' ? block : `${block}\n${bottom}`;
};

interface IForeachHeaderData {
  readonly arr: string;
  readonly item: string;
  readonly index: string;
}

export const emitForeach = (node: INode, ctx: ICppStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IForeachHeaderData;
  const arrType = ctx.scope[data.arr.trim()];
  if (!arrType || arrType.type !== 'array') {
    throw new Error(`"${data.arr}" must be a plain array-typed identifier already in scope for C++ compilation`);
  }
  const arr = compileExpr(data.arr, ctx, node.id);
  const item = data.item.trim();
  const index = data.index.trim() === '' ? `${item}_index` : data.index.trim();
  const body = compile(appendOut(node), {
    scopeOverrides: { [item]: arrType.elementType, [index]: INT32_TYPE },
    nesting: [...ctx.nesting, 'loop'],
  });
  const itemDeclaration = `${variableInfoToCppType(arrType.elementType, ctx.params.structNames)} ${item} = ${arr}[${index}];`;
  const forBlock = `for (int ${index} = 0; ${index} < static_cast<int>(${arr}.size()); ${index}++) {\n${indentLines(`${itemDeclaration}\n${body}`)}\n}`;
  return appendCycleBottom(forBlock, ctx);
};

interface IFromToCycleHeaderData {
  readonly from: string;
  readonly to: string;
  readonly item: string;
}

export const emitFromToCycle = (node: INode, ctx: ICppStatementContext, compile: TCompileChildren): string => {
  const data = node.data as IFromToCycleHeaderData;
  const from = compileExpr(data.from, ctx, node.id);
  const to = compileExpr(data.to, ctx, node.id);
  const item = data.item.trim();
  const body = compile(appendOut(node), { scopeOverrides: { [item]: INT32_TYPE }, nesting: [...ctx.nesting, 'loop'] });
  const forBlock = `for (int ${item} = ${from}; ${item} <= ${to}; ${item}++) {\n${indentLines(body)}\n}`;
  return appendCycleBottom(forBlock, ctx);
};

/**
 * `while`'s "True" branch label is flipped by `meta.trueIsMain` — by default (absent/`false`) "True"
 * marks the back-edge (repeat the loop), so the raw condition compiles as-is. When `trueIsMain` is
 * `true`, "True" instead marks the main path down (exit the loop), so the condition must be negated
 * for the loop to keep repeating on "False" — same convention as this file's own `resolveIfBranches`,
 * just for a loop's single condition instead of two branches. Same helper, independently implemented,
 * in every other `*-control-flow-emitters.ts` and `@falang/workflow-compiler`'s `node-emitters.ts`.
 */
const resolveWhileCondition = (condition: string, node: INode): string => {
  const trueIsMain = node.meta?.trueIsMain === true;
  return trueIsMain ? `!(${condition})` : condition;
};

export const emitWhile = (node: INode, ctx: ICppStatementContext, compile: TCompileChildren): string => {
  const condition = resolveWhileCondition(compileExpr((node.data as string | undefined) ?? '', ctx, node.id), node);
  const body = compile(appendOut(node), { nesting: [...ctx.nesting, 'loop'] });
  const whileBlock = `while (${condition}) {\n${indentLines(body)}\n}`;
  return appendCycleBottom(whileBlock, ctx);
};

/** "Run once unless explicitly repeated" — same `while (true) { ...; break; }` shape as `@falang/workflow-compiler`'s own `emitPseudoCycle`. */
export const emitPseudoCycle = (node: INode, ctx: ICppStatementContext, compile: TCompileChildren): string => {
  const body = compile(appendOut(node), { nesting: [...ctx.nesting, 'loop'] });
  const content = body === '' ? 'break;' : `${body}\nbreak;`;
  const whileBlock = `while (true) {\n${indentLines(content)}\n}`;
  return appendCycleBottom(whileBlock, ctx);
};
