import ts from 'typescript';
import type { TNumberTypeDetail, TVariableInfo } from '@falang/typescript-dto';
import type { IDecimalCodegen } from './decimal-codegen.js';
import { COMPARISON_OPERATORS } from './decimal-codegen.js';
import { rescaleDecimalValue } from './decimal-literal.js';
import type { ILanguageAdapter } from './language-adapter.js';
import { UnsupportedConstructError } from './language-adapter.js';
import type { INumericTypeContext } from './numeric-coercion.js';
import { numericLiteralValue, promoteNumberType, resolveVariableInfo } from './numeric-coercion.js';

/** The decimal half of `walk-expression.ts` (ADR 0069 (private) §4): operand promotion, stores and printing. */

export interface IDecimalWalkEnv {
  readonly adapter: ILanguageAdapter;
  /** Always resolves literals. */
  readonly numericContext: INumericTypeContext;
  readonly emit: (node: ts.Expression) => string;
  readonly sourceFile: ts.SourceFile;
}

const FLOAT64: TNumberTypeDetail = { type: 'float', floatType: 'float64' };
const INT32: TNumberTypeDetail = { type: 'integer', integerType: 'int32' };

const MATH_FLOAT_CALLS: ReadonlySet<string> = new Set([
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

const ARITHMETIC: ReadonlySet<string> = new Set(['+', '-', '*', '/', '%']);

export const withLiterals = (context: INumericTypeContext): INumericTypeContext =>
  context.resolveLiterals ? context : { ...context, resolveLiterals: true };

const requireCodegen = (adapter: ILanguageAdapter): IDecimalCodegen => {
  if (!adapter.decimal) throw new UnsupportedConstructError(`Decimal numbers are not supported for ${adapter.target}`);
  return adapter.decimal;
};

/** The number type of an expression, counting the `Math.*` calls as float64; `undefined` when unknown. */
export const resolveNumberDetail = (node: ts.Expression, env: IDecimalWalkEnv): TNumberTypeDetail | undefined => {
  const unwrapped = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (ts.isCallExpression(unwrapped) && MATH_FLOAT_CALLS.has(unwrapped.expression.getText(env.sourceFile))) {
    return FLOAT64;
  }
  const info = resolveVariableInfo(node, env.numericContext);
  if (info?.type === 'number') return info.numberType;
};

/** Whether `node` is a decimal-typed expression (not a bare literal). */
export const isDecimalExpression = (node: ts.Expression, env: IDecimalWalkEnv): boolean =>
  resolveNumberDetail(node, env)?.type === 'decimal';

const describeNode = (node: ts.Node, env: IDecimalWalkEnv): string => node.getText(env.sourceFile);

interface IOperand {
  readonly node: ts.Expression;
  readonly literal?: ReturnType<typeof numericLiteralValue>;
  readonly detail?: TNumberTypeDetail;
}

const classify = (node: ts.Expression, env: IDecimalWalkEnv): IOperand => {
  const literal = numericLiteralValue(node);
  if (literal) return { node, literal };
  return { node, detail: resolveNumberDetail(node, env) };
};

const operandScale = (operand: IOperand): number => {
  if (operand.literal) return operand.literal.scale;
  return operand.detail?.type === 'decimal' ? operand.detail.decimals : 0;
};

/** The code for `operand` as a decimal at `scale`. */
const emitOperandAtScale = (operand: IOperand, scale: number, env: IDecimalWalkEnv): string => {
  const codegen = requireCodegen(env.adapter);
  if (operand.literal) return codegen.literal(rescaleDecimalValue(operand.literal, scale), scale);
  const { detail } = operand;
  if (detail?.type === 'decimal') {
    const code = env.emit(operand.node);
    return detail.decimals === scale ? code : codegen.rescale(code, detail.decimals, scale);
  }
  if (detail?.type === 'integer') return codegen.fromInteger(env.emit(operand.node), detail, scale);
  throw new UnsupportedConstructError(
    `Cannot mix a decimal with the value "${describeNode(operand.node, env)}" of an unknown number type`,
  );
};

/** One operand of a float operation next to a decimal: decimals are converted, integers widened like any other float mix. */
const emitOperandAsFloat = (operand: IOperand, floatType: TNumberTypeDetail, env: IDecimalWalkEnv): string => {
  const { adapter } = env;
  if (operand.literal) {
    return operand.literal.scale === 0
      ? adapter.castNumericOperand(env.emit(operand.node), INT32, floatType)
      : env.emit(operand.node);
  }
  const { detail } = operand;
  if (detail?.type === 'decimal') {
    return requireCodegen(adapter).toFloat(env.emit(operand.node), detail.decimals, floatType);
  }
  if (detail) return adapter.castNumericOperand(env.emit(operand.node), detail, floatType);
  return env.emit(operand.node);
};

export interface IDecimalResult {
  readonly code: string;
  readonly detail: TNumberTypeDetail;
}

/**
 * `left op right` where at least one operand is a decimal — `undefined` when none is (the caller's ordinary path).
 * Arithmetic gives a decimal of the larger scale (a float when a float is mixed in), comparisons a boolean.
 */
export const emitDecimalBinaryParts = (
  operatorText: string,
  leftNode: ts.Expression,
  rightNode: ts.Expression,
  env: IDecimalWalkEnv,
): IDecimalResult | undefined => {
  const isArithmetic = ARITHMETIC.has(operatorText);
  const mapped = env.adapter.mapBinaryOperator(operatorText);
  if (!isArithmetic && !COMPARISON_OPERATORS.has(mapped)) return;
  const left = classify(leftNode, env);
  const right = classify(rightNode, env);
  if (left.detail?.type !== 'decimal' && right.detail?.type !== 'decimal') return;
  const codegen = requireCodegen(env.adapter);
  const floatOperand = [left, right].find((operand) => operand.detail?.type === 'float');
  if (floatOperand?.detail) {
    let floatDetail: TNumberTypeDetail = floatOperand.detail;
    for (const operand of [left, right]) {
      if (operand.detail?.type === 'float') floatDetail = promoteNumberType(floatDetail, operand.detail) ?? floatDetail;
    }
    const code = `${emitOperandAsFloat(left, floatDetail, env)} ${mapped} ${emitOperandAsFloat(right, floatDetail, env)}`;
    return { code, detail: isArithmetic ? floatDetail : { type: 'any' } };
  }
  const scale = Math.max(operandScale(left), operandScale(right));
  const code = codegen.arithmetic(
    mapped,
    emitOperandAtScale(left, scale, env),
    emitOperandAtScale(right, scale, env),
    scale,
  );
  return { code, detail: isArithmetic ? { type: 'decimal', digits: 18, decimals: scale } : { type: 'any' } };
};

/** `a op b` as the walker's binary branch sees it — `undefined` when no decimal is involved. */
export const emitDecimalBinary = (node: ts.BinaryExpression, env: IDecimalWalkEnv): string | undefined => {
  const operatorText = ts.tokenToString(node.operatorToken.kind);
  if (!operatorText) return;
  return emitDecimalBinaryParts(operatorText, node.left, node.right, env)?.code;
};

/** Converts a value of number type `from` for a store into `to`; code unchanged when no decimal is involved. */
export const convertNumberStore = (
  code: string,
  from: TNumberTypeDetail | undefined,
  to: TNumberTypeDetail | undefined,
  adapter: ILanguageAdapter,
): string => {
  if (!from || !to) return code;
  if (from.type !== 'decimal' && to.type !== 'decimal') return code;
  const codegen = requireCodegen(adapter);
  if (to.type === 'decimal') {
    if (from.type === 'decimal')
      return from.decimals === to.decimals ? code : codegen.rescale(code, from.decimals, to.decimals);
    if (from.type === 'integer') return codegen.fromInteger(code, from, to.decimals);
    if (from.type === 'float') return codegen.fromFloat(code, to.decimals);
    return code;
  }
  if (from.type === 'decimal') {
    if (to.type === 'integer') return codegen.toInteger(code, from.decimals, to);
    if (to.type === 'float') return codegen.toFloat(code, from.decimals, to);
  }
  return code;
};

/** Emits `node` for a store into `target` (a decimal literal exactly, anything else converted when a decimal is involved). */
export const emitNumberForTarget = (
  node: ts.Expression,
  target: TNumberTypeDetail,
  env: IDecimalWalkEnv,
): string | undefined => {
  const literal = numericLiteralValue(node);
  if (literal && target.type === 'decimal') {
    return requireCodegen(env.adapter).literal(rescaleDecimalValue(literal, target.decimals), target.decimals);
  }
  const from = resolveNumberDetail(node, env);
  if (from?.type !== 'decimal' && target.type !== 'decimal') return;
  return convertNumberStore(env.emit(node), from, target, env.adapter);
};

/** `x = e` / `x op= e` with a decimal on either side: the value is computed, converted to `x`'s type and handed back for the adapter's assignment. */
export const emitDecimalAssignmentValue = (
  operatorText: string,
  left: ts.Expression,
  right: ts.Expression,
  env: IDecimalWalkEnv,
): { rightCode: string; leftDetail: TNumberTypeDetail } | undefined => {
  const leftDetail = resolveNumberDetail(left, env);
  const rightDetail = resolveNumberDetail(right, env);
  if (!leftDetail) return;
  if (leftDetail.type !== 'decimal' && rightDetail?.type !== 'decimal') return;
  if (operatorText === '=') {
    const rightCode = emitNumberForTarget(right, leftDetail, env);
    if (typeof rightCode !== 'string') return;
    return { rightCode, leftDetail };
  }
  if (!operatorText.endsWith('=') || operatorText.length < 2) return;
  const binaryOperator = operatorText.slice(0, -1);
  if (!ARITHMETIC.has(binaryOperator)) return;
  const result = emitDecimalBinaryParts(binaryOperator, left, right, env);
  if (!result) return;
  return { rightCode: convertNumberStore(result.code, result.detail, leftDetail, env.adapter), leftDetail };
};

/** A decimal-typed segment of a template literal: printed with its scale (and no longer a number for the adapter). */
export const printDecimalSegment = (code: string, node: ts.Expression, env: IDecimalWalkEnv): string | undefined => {
  const detail = resolveNumberDetail(node, env);
  if (detail?.type !== 'decimal') return;
  return requireCodegen(env.adapter).print(code, detail.decimals);
};

/** `Math.*` takes floats: a decimal argument is converted to float64. */
export const emitMathArgument = (node: ts.Expression, code: string, env: IDecimalWalkEnv): string => {
  const detail = resolveNumberDetail(node, env);
  return detail?.type === 'decimal' ? requireCodegen(env.adapter).toFloat(code, detail.decimals, FLOAT64) : code;
};

const ASSIGNMENT_OPERATORS: ReadonlySet<string> = new Set(['=', '+=', '-=', '*=', '/=', '%=']);

/** A binary / assignment expression with a decimal on either side (ADR 0069 (private) §4); `undefined` when there is none. */
export const emitDecimalOperation = (
  node: ts.BinaryExpression,
  operatorText: string,
  checker: ts.TypeChecker,
  adapter: ILanguageAdapter,
  env: IDecimalWalkEnv,
  emit: (child: ts.Expression) => string,
): string | undefined => {
  if (!ASSIGNMENT_OPERATORS.has(operatorText)) return emitDecimalBinary(node, env);
  const value = emitDecimalAssignmentValue(operatorText, node.left, node.right, env);
  if (!value) return;
  return adapter.emitAssignment({
    leftCode: emit(node.left),
    leftType: checker.getTypeAtLocation(node.left),
    leftNumberType: value.leftDetail,
    rightCode: value.rightCode,
    rightIsIntegerLiteral: false,
    rightVariableInfo: { type: 'number', numberType: value.leftDetail },
    checker,
  });
};

export interface IEmitPortableExpressionOptions {
  /** The declared type of the store the whole expression flows into — a decimal source or target is converted (ADR 0069 (private) §4). */
  readonly targetType?: TVariableInfo;
  /** The value is printed: a decimal becomes a text with exactly its scale's fraction digits. */
  readonly print?: boolean;
}

/** An array literal stored into an array type, element by element (a decimal element is converted). */
const emitTargeted = (
  node: ts.Expression,
  target: TVariableInfo,
  adapter: ILanguageAdapter,
  env: IDecimalWalkEnv,
  emit: (child: ts.Expression) => string,
): string => {
  if (target.type === 'number') return emitNumberForTarget(node, target.numberType, env) ?? emit(node);
  if (target.type === 'array' && ts.isArrayLiteralExpression(node) && adapter.emitArrayLiteral) {
    const elementTarget: TVariableInfo =
      target.dimensions > 1 ? { ...target, dimensions: target.dimensions - 1 } : target.elementType;
    return adapter.emitArrayLiteral({
      elementCodes: node.elements.map((element) => emitTargeted(element, elementTarget, adapter, env, emit)),
    });
  }
  return emit(node);
};

export const emitWithOptions = (
  node: ts.Expression,
  adapter: ILanguageAdapter,
  env: IDecimalWalkEnv,
  options: IEmitPortableExpressionOptions,
): string => {
  const code = options.targetType ? emitTargeted(node, options.targetType, adapter, env, env.emit) : env.emit(node);
  if (!options.print) return code;
  return printDecimalSegment(code, node, env) ?? code;
};
