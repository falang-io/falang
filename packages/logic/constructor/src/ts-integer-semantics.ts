import ts from 'typescript';
import type { TNumberTypeDetail, TVariableInfo } from '@falang/typescript-dto';
import { formatDecimalText, rescaleDecimalValue } from './decimal-literal.js';
import type { INumericTypeContext } from './numeric-coercion.js';
import { numericLiteralValue, resolveVariableInfo } from './numeric-coercion.js';

/**
 * Number semantics for the TS/JS targets (ADR 0069 (private) §3, §4), so one project prints the same thing in every
 * target: an integer `/` integer division and a float/decimal stored into an integer-typed target are truncated, and
 * a decimal's `+ - * / %`, stores and printing go through the `falangDec*` helpers of `decimal/ts-decimal.ts`.
 * Integer overflow and unsigned wrap-around are NOT emulated. An operand whose number type can't be resolved is left
 * alone, as in the native targets' casts.
 *
 * The expression is rewritten as text: edits (insertions and replacements of source ranges) are collected on the
 * checked AST and applied back to front.
 */

const FLOAT_MATH_CALLS: ReadonlySet<string> = new Set([
  'Math.sqrt',
  'Math.pow',
  'Math.floor',
  'Math.ceil',
  'Math.round',
  'Math.random',
  'Math.abs',
  'Math.min',
  'Math.max',
]);

const FLOAT64_INFO: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float64' } };

export const createTsNumericContext = (base: Omit<INumericTypeContext, 'resolveLiterals'>): INumericTypeContext => ({
  ...base,
  resolveLiterals: true,
});

type TDecimalFunction = 'falangDecAdd' | 'falangDecSub' | 'falangDecMul' | 'falangDecDiv' | 'falangDecMod';

const DECIMAL_FUNCTIONS: ReadonlyMap<ts.SyntaxKind, TDecimalFunction> = new Map([
  [ts.SyntaxKind.PlusToken, 'falangDecAdd'],
  [ts.SyntaxKind.MinusToken, 'falangDecSub'],
  [ts.SyntaxKind.AsteriskToken, 'falangDecMul'],
  [ts.SyntaxKind.SlashToken, 'falangDecDiv'],
  [ts.SyntaxKind.PercentToken, 'falangDecMod'],
]);

const COMPOUND_FUNCTIONS: ReadonlyMap<ts.SyntaxKind, TDecimalFunction> = new Map([
  [ts.SyntaxKind.PlusEqualsToken, 'falangDecAdd'],
  [ts.SyntaxKind.MinusEqualsToken, 'falangDecSub'],
  [ts.SyntaxKind.AsteriskEqualsToken, 'falangDecMul'],
  [ts.SyntaxKind.SlashEqualsToken, 'falangDecDiv'],
  [ts.SyntaxKind.PercentEqualsToken, 'falangDecMod'],
]);

interface IEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly order: number;
}

type TClose = () => void;

class EditList {
  readonly edits: IEdit[] = [];

  insert(position: number, text: string): void {
    this.edits.push({ start: position, end: position, text, order: this.edits.length });
  }

  replace(start: number, end: number, text: string): void {
    this.edits.push({ start, end, text, order: this.edits.length });
  }

  /**
   * Wraps `node` as `prefix` + node + `suffix`: the opening goes in now, the returned function adds the closing and
   * must be called after the node's children were visited, so that two wraps ending at one position nest properly.
   */
  wrap(node: ts.Node, sourceFile: ts.SourceFile, prefix: string, suffix: string): TClose {
    this.insert(node.getStart(sourceFile), prefix);
    return () => this.insert(node.getEnd(), suffix);
  }

  /**
   * Back to front, so earlier offsets stay valid. At one position: a replacement before the insertions that end up to
   * its left, and of two insertions the later-created one first (it lands to the right of the earlier one).
   */
  apply(text: string, offset: number): string {
    const sorted = this.edits.toSorted((a, b) => b.start - a.start || b.end - a.end || b.order - a.order);
    let result = text;
    for (const edit of sorted) {
      result = `${result.slice(0, edit.start - offset)}${edit.text}${result.slice(edit.end - offset)}`;
    }
    return result;
  }
}

interface IContext {
  readonly numeric: INumericTypeContext;
  readonly sourceFile: ts.SourceFile;
  readonly edits: EditList;
}

/** `resolveVariableInfo` plus the `Math.*` calls that always produce a (possibly fractional) float. */
const resolveInfo = (node: ts.Expression, context: IContext) => {
  const unwrapped = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (ts.isCallExpression(unwrapped) && FLOAT_MATH_CALLS.has(unwrapped.expression.getText(context.sourceFile))) {
    return FLOAT64_INFO;
  }
  return resolveVariableInfo(node, context.numeric);
};

const detailOf = (node: ts.Expression, context: IContext): TNumberTypeDetail | undefined => {
  const info = resolveInfo(node, context);
  if (info?.type === 'number') return info.numberType;
};

const isIntegerDetail = (detail: TNumberTypeDetail | undefined): boolean => detail?.type === 'integer';

const isFractionalDetail = (detail: TNumberTypeDetail | undefined): boolean =>
  detail?.type === 'float' || detail?.type === 'decimal';

const scaleOf = (node: ts.Expression, detail: TNumberTypeDetail | undefined): number => {
  const literal = numericLiteralValue(node);
  if (literal) return literal.scale;
  return detail?.type === 'decimal' ? detail.decimals : 0;
};

const truncate = (node: ts.Node, context: IContext): TClose =>
  context.edits.wrap(node, context.sourceFile, 'Math.trunc(', ')');

/**
 * Converts the value of `node` for a store into a decimal of `target` scale: an exact literal spelling, a rescale of a
 * wider decimal, a rounded float. Returns whether anything was done.
 */
const convertToDecimal = (node: ts.Expression, targetScale: number, context: IContext): TClose | undefined => {
  const literal = numericLiteralValue(node);
  if (literal) {
    if (literal.scale > targetScale) {
      const text = formatDecimalText(rescaleDecimalValue(literal, targetScale), targetScale);
      context.edits.replace(node.getStart(context.sourceFile), node.getEnd(), text);
    }
    return;
  }
  const from = detailOf(node, context);
  if (from?.type === 'decimal' && from.decimals > targetScale) {
    return context.edits.wrap(node, context.sourceFile, 'falangDecRescale(', `, ${from.decimals}, ${targetScale})`);
  }
  if (from?.type === 'float') {
    return context.edits.wrap(node, context.sourceFile, 'falangDecFromFloat(', `, ${targetScale})`);
  }
};

/** A store of `node` into a number-typed target (`create-var`, argument, `return`, assignment, array element). */
const convertForTarget = (node: ts.Expression, target: TNumberTypeDetail, context: IContext): TClose | undefined => {
  if (target.type === 'decimal') return convertToDecimal(node, target.decimals, context);
  if (isIntegerDetail(target) && isFractionalDetail(detailOf(node, context))) return truncate(node, context);
};

/** Opens a `falangDec…(` call over `left op right`; the returned function closes it (after the children were visited). */
const wrapDecimalCall = (
  node: ts.BinaryExpression,
  functionName: TDecimalFunction,
  scale: number,
  context: IContext,
): TClose => {
  const { edits, sourceFile } = context;
  edits.insert(node.getStart(sourceFile), `${functionName}(`);
  edits.replace(node.left.getEnd(), node.right.getStart(sourceFile), ', ');
  return () => edits.insert(node.getEnd(), `, ${scale})`);
};

/** A float *value* in the mix (a fractional literal next to a decimal is a decimal, not a float). */
const hasFloatOperand = (nodes: readonly ts.Expression[], context: IContext): boolean =>
  nodes.some((node) => !numericLiteralValue(node) && detailOf(node, context)?.type === 'float');

/** `a op b` where a decimal takes part — a `falangDec…` call, or nothing (a float in the mix, a comparison). */
const handleDecimalArithmetic = (node: ts.BinaryExpression, context: IContext): TClose | undefined => {
  const functionName = DECIMAL_FUNCTIONS.get(node.operatorToken.kind);
  if (!functionName) return;
  const leftDetail = detailOf(node.left, context);
  const rightDetail = detailOf(node.right, context);
  if (leftDetail?.type !== 'decimal' && rightDetail?.type !== 'decimal') return;
  if (hasFloatOperand([node.left, node.right], context)) return;
  const scale = Math.max(scaleOf(node.left, leftDetail), scaleOf(node.right, rightDetail));
  return wrapDecimalCall(node, functionName, scale, context);
};

/** `x op= y` with a decimal on either side: `x = falangDecOp(x, y, R)`, narrowed back to `x`'s own type. */
const handleDecimalCompound = (node: ts.BinaryExpression, context: IContext): TClose | undefined => {
  const functionName = COMPOUND_FUNCTIONS.get(node.operatorToken.kind);
  if (!functionName) return;
  const leftDetail = detailOf(node.left, context);
  const rightDetail = detailOf(node.right, context);
  if (leftDetail?.type !== 'decimal' && rightDetail?.type !== 'decimal') return;
  if (hasFloatOperand([node.left, node.right], context) || !leftDetail) return;
  const scale = Math.max(scaleOf(node.left, leftDetail), scaleOf(node.right, rightDetail));
  const leftText = node.left.getText(context.sourceFile);
  let prefix = '';
  let suffix = '';
  if (leftDetail.type === 'decimal' && scale > leftDetail.decimals) {
    prefix = 'falangDecRescale(';
    suffix = `, ${scale}, ${leftDetail.decimals})`;
  } else if (leftDetail.type === 'integer') {
    prefix = 'Math.trunc(';
    suffix = ')';
  }
  const { edits, sourceFile } = context;
  edits.replace(node.left.getEnd(), node.right.getStart(sourceFile), ` = ${prefix}${functionName}(${leftText}, `);
  return () => edits.insert(node.getEnd(), `, ${scale})${suffix}`);
};

const handleBinary = (node: ts.BinaryExpression, context: IContext): TClose | undefined => {
  const operator = node.operatorToken.kind;
  const decimalCall = handleDecimalArithmetic(node, context) ?? handleDecimalCompound(node, context);
  if (decimalCall) return decimalCall;
  const leftDetail = detailOf(node.left, context);
  const rightDetail = detailOf(node.right, context);
  if (operator === ts.SyntaxKind.SlashToken && isIntegerDetail(leftDetail) && isIntegerDetail(rightDetail)) {
    return truncate(node, context);
  }
  if (operator === ts.SyntaxKind.EqualsToken && leftDetail) return convertForTarget(node.right, leftDetail, context);
};

/** A decimal-typed `${…}` is printed with exactly its scale's digits. */
const printIfDecimal = (node: ts.Expression, context: IContext): TClose | undefined => {
  const detail = detailOf(node, context);
  if (detail?.type === 'decimal') {
    return context.edits.wrap(node, context.sourceFile, 'falangDecStr(', `, ${detail.decimals})`);
  }
};

const collectEdits = (root: ts.Node, context: IContext): void => {
  const visit = (node: ts.Node): void => {
    const closers: (TClose | undefined)[] = [];
    if (ts.isBinaryExpression(node)) closers.push(handleBinary(node, context));
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) closers.push(printIfDecimal(span.expression, context));
    }
    ts.forEachChild(node, visit);
    for (const close of closers.toReversed()) close?.();
  };
  visit(root);
};

export interface ITsNumberSemanticsOptions {
  /** The declared type of the store the whole expression flows into. */
  readonly targetType?: TVariableInfo;
  /** The value is printed: a decimal becomes a text with exactly its scale's fraction digits. */
  readonly print?: boolean;
}

const convertForTargetType = (
  node: ts.Expression,
  target: TVariableInfo,
  context: IContext,
): (TClose | undefined)[] => {
  if (target.type === 'number') return [convertForTarget(node, target.numberType, context)];
  if (target.type === 'array' && ts.isArrayLiteralExpression(node)) {
    const elementTarget: TVariableInfo =
      target.dimensions > 1 ? { ...target, dimensions: target.dimensions - 1 } : target.elementType;
    return node.elements.flatMap((element) => convertForTargetType(element, elementTarget, context));
  }
  return [];
};

/**
 * Returns `expression` rewritten for the number semantics. `exprNode` is the checked initializer of the virtual file;
 * `exprStart` is the offset of `expression` inside that file's text.
 */
export const applyTsIntegerSemantics = (
  expression: string,
  exprNode: ts.Expression,
  exprStart: number,
  sourceFile: ts.SourceFile,
  numeric: INumericTypeContext,
  options: ITsNumberSemanticsOptions = {},
): string => {
  const context: IContext = { numeric, sourceFile, edits: new EditList() };
  // The outermost wraps open first and close last.
  const closers: (TClose | undefined)[] = options.targetType
    ? convertForTargetType(exprNode, options.targetType, context)
    : [];
  if (options.print) closers.push(printIfDecimal(exprNode, context));
  collectEdits(exprNode, context);
  for (const close of closers.toReversed()) close?.();
  if (context.edits.edits.length === 0) return expression;
  return context.edits.apply(expression, exprStart);
};
