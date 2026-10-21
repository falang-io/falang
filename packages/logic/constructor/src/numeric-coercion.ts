import ts from 'typescript';
import type { TFloatType, TIntegerType, TNumberTypeDetail, TVariableInfo } from '@falang/typescript-dto';
import type { IStructDefinition } from './struct-definition.js';

export interface INumericTypeContext {
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  readonly structDefinitions: ReadonlyMap<string, IStructDefinition>;
  /**
   * Also resolve numeric literals (ADR 0069 (private) §3; a `call-function` result is already a typed scope variable). Off for the
   * Go/Rust/C#/C++ adapters, whose operand casts must stay exactly as they were (an untyped literal
   * never needs a cast there); on for the TS/JS integer-semantics rewrite.
   */
  readonly resolveLiterals?: boolean;
}

type TNumberWidth = TIntegerType | TFloatType;

/** `int8 < uint8 < int16 < uint16 < int32 < uint32 < int64 < uint64 < float32 < float64` (ADR 0069 (private) §2). */
const WIDTH_RANK: Readonly<Record<TNumberWidth, number>> = {
  int8: 0,
  uint8: 1,
  int16: 2,
  uint16: 3,
  int32: 4,
  uint32: 5,
  int64: 6,
  uint64: 7,
  float32: 8,
  float64: 9,
};

/**
 * `undefined` for `numberType.type === 'any' | 'decimal'` — neither `golang-type-name.ts`'s
 * `variableInfoToGoType` nor `rust-type-name.ts`'s `variableInfoToRustType` support those widths
 * either (both throw `UnsupportedConstructError`), so a value of one of those kinds never reaches a
 * cast decision with a real target type anyway.
 */
export const widthOf = (detail: TNumberTypeDetail): TNumberWidth | undefined => {
  if (detail.type === 'integer') return detail.integerType;
  if (detail.type === 'float') return detail.floatType;
};

/**
 * The DSL analogue of C++'s "usual arithmetic conversions" — float always outranks every integer
 * width (mixing an int and a float always promotes to the float, mirroring `objects`' own `ObjCSum`,
 * see ADR 0019 (private)'s numeric-coercion follow-up), and between two widths of the same kind the
 * wider one wins. Returns `undefined` only when a width can't be determined at all (`any`/`decimal`)
 * — never for "already equal", which just promotes to that same shared width (a no-op cast
 * downstream, see each adapter's own `castNumericOperand`).
 */
export const promoteNumberType = (a: TNumberTypeDetail, b: TNumberTypeDetail): TNumberTypeDetail | undefined => {
  const aWidth = widthOf(a);
  const bWidth = widthOf(b);
  if (!aWidth || !bWidth) return;
  return WIDTH_RANK[aWidth] >= WIDTH_RANK[bWidth] ? a : b;
};

/** `int8`/`uint8` — C++ iostream treats these as characters. */
export const isEightBitInteger = (detail: TNumberTypeDetail | undefined): boolean =>
  detail?.type === 'integer' && (detail.integerType === 'int8' || detail.integerType === 'uint8');

/** Whether a value of number type `from` needs an explicit conversion to be stored into `to` in Go/Rust — only when both widths are known and differ. */
export const needsNumericCast = (from: TNumberTypeDetail | undefined, to: TNumberTypeDetail | undefined): boolean => {
  if (!from || !to) return false;
  const fromWidth = widthOf(from);
  const toWidth = widthOf(to);
  return Boolean(fromWidth && toWidth && fromWidth !== toWidth);
};

const ARITHMETIC_OPERATORS: ReadonlySet<string> = new Set(['+', '-', '*', '/', '%']);

/**
 * `resolveVariableInfo` (below) is a self-referencing dispatcher — passed into these helpers as a
 * parameter, rather than closed over as an outer `const`, so this file's declaration order doesn't
 * matter for the mutual recursion between them (`oxlint`'s `no-use-before-define` forbids two
 * top-level `const`s referencing each other directly; see `feedback_oxlint_rules.md`'s entry 7 for the
 * same pattern already established in `@falang/workflow-compiler`'s `node-emitters.ts`).
 */
type TResolveVariableInfo = (node: ts.Expression, context: INumericTypeContext) => TVariableInfo | undefined;

const resolvePropertyAccessInfo = (
  node: ts.PropertyAccessExpression,
  context: INumericTypeContext,
  resolve: TResolveVariableInfo,
): TVariableInfo | undefined => {
  const receiverInfo = resolve(node.expression, context);
  if (receiverInfo?.type !== 'struct') return;
  return context.structDefinitions.get(receiverInfo.id)?.properties[node.name.text];
};

const resolveElementAccessInfo = (
  node: ts.ElementAccessExpression,
  context: INumericTypeContext,
  resolve: TResolveVariableInfo,
): TVariableInfo | undefined => {
  const receiverInfo = resolve(node.expression, context);
  if (receiverInfo?.type === 'array') return receiverInfo.elementType;
};

/** Only a left-associative chain of *arithmetic* operators propagates a number type upward — a comparison (`<`, `==`, …) or logical (`&&`, `||`) operator produces a boolean, which is never itself an operand `resolveVariableInfo`'s caller needs a numeric width for. */
const resolveArithmeticBinaryInfo = (
  node: ts.BinaryExpression,
  context: INumericTypeContext,
  resolve: TResolveVariableInfo,
): TVariableInfo | undefined => {
  const operatorText = ts.tokenToString(node.operatorToken.kind);
  if (!operatorText || !ARITHMETIC_OPERATORS.has(operatorText)) return;
  const leftInfo = resolve(node.left, context);
  const rightInfo = resolve(node.right, context);
  if (leftInfo?.type !== 'number' || rightInfo?.type !== 'number') return;
  const promoted = promoteNumberType(leftInfo.numberType, rightInfo.numberType);
  if (promoted) return { type: 'number', numberType: promoted };
};

/**
 * Resolves the DSL-level `TVariableInfo` of a type-checked expression node — needed only because
 * `ts.Type` itself can't answer "is this int32 or float32": `checker.getTypeAtLocation` collapses
 * every DSL numeric width to the same TS `number` (see `variableInfoToTsType`), which is why
 * `walk-expression.ts`'s binary-expression branch can't just ask the checker.
 *
 * Deliberately narrow — handles exactly the shapes `objects`' own `ObjCSum`
 * (`c.x + c.y + c.z.x + c.z.y + c.z.z`) needs: identifiers, struct field access, array element access,
 * unary plus/minus, parens, and a nested *arithmetic* binary expression (so a promoted width
 * propagates correctly through a left-associative `+` chain, not just a single pair). A numeric
 * literal or a call (`Math.sqrt(...)`) resolves to `undefined` (unknown) — same "no fixture needs it
 * yet" posture as every other still-open gap this ADR tracks; callers treat `undefined` as "leave this
 * operand alone" rather than guessing at a cast.
 */
const INT32_INFO: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const FLOAT64_INFO: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float64' } };

/** An integer-looking literal takes the other operand's type (decided by the caller); a literal with a point or exponent is `float64`. */
const resolveLiteralInfo = (node: ts.NumericLiteral): TVariableInfo =>
  /^[0-9]+$/.test(node.getText()) ? INT32_INFO : FLOAT64_INFO;

const isLiteralLike = (node: ts.Expression): boolean => {
  if (ts.isParenthesizedExpression(node)) return isLiteralLike(node.expression);
  if (ts.isNumericLiteral(node)) return /^[0-9]+$/.test(node.getText());
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken)
    return isLiteralLike(node.operand);
  return false;
};

/** With `resolveLiterals` on, an integer-looking literal operand adopts the other operand's number type (so `a / 2` is an integer division when `a` is an integer). */
const resolveLiteralAwareBinaryInfo = (
  node: ts.BinaryExpression,
  context: INumericTypeContext,
  resolve: TResolveVariableInfo,
): TVariableInfo | undefined => {
  const operatorText = ts.tokenToString(node.operatorToken.kind);
  if (!operatorText || !ARITHMETIC_OPERATORS.has(operatorText)) return;
  const leftIsLiteral = isLiteralLike(node.left);
  const rightIsLiteral = isLiteralLike(node.right);
  const leftInfo = resolve(node.left, context);
  const rightInfo = resolve(node.right, context);
  if (leftInfo?.type !== 'number' || rightInfo?.type !== 'number') return;
  if (leftIsLiteral && !rightIsLiteral) return rightInfo;
  if (rightIsLiteral && !leftIsLiteral) return leftInfo;
  const promoted = promoteNumberType(leftInfo.numberType, rightInfo.numberType);
  if (promoted) return { type: 'number', numberType: promoted };
};

export const resolveVariableInfo: TResolveVariableInfo = (node, context) => {
  if (context.resolveLiterals) {
    if (ts.isNumericLiteral(node)) return resolveLiteralInfo(node);
    if (ts.isBinaryExpression(node)) return resolveLiteralAwareBinaryInfo(node, context, resolveVariableInfo);
  }
  if (ts.isParenthesizedExpression(node)) return resolveVariableInfo(node.expression, context);
  if (ts.isIdentifier(node)) return context.scope[node.text];
  if (ts.isPropertyAccessExpression(node)) return resolvePropertyAccessInfo(node, context, resolveVariableInfo);
  if (ts.isElementAccessExpression(node)) return resolveElementAccessInfo(node, context, resolveVariableInfo);
  if (
    ts.isPrefixUnaryExpression(node) &&
    (node.operator === ts.SyntaxKind.MinusToken || node.operator === ts.SyntaxKind.PlusToken)
  ) {
    return resolveVariableInfo(node.operand, context);
  }
  if (ts.isBinaryExpression(node)) return resolveArithmeticBinaryInfo(node, context, resolveVariableInfo);
};
