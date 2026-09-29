import ts from 'typescript';
import type { ILanguageAdapter, ITemplateLiteralSegment } from './language-adapter.js';
import { UnsupportedConstructError } from './language-adapter.js';
import type { INumericTypeContext } from './numeric-coercion.js';
import { promoteNumberType, resolveVariableInfo } from './numeric-coercion.js';

/**
 * Applies `castNumericOperand` to `leftCode`/`rightCode` when both operands of a binary expression
 * resolve to a (possibly different) DSL numeric width — the numeric-coercion mechanism described in
 * ADR 0019 (private)'s follow-up. Returns `undefined` when there's nothing to coerce (no
 * `numericContext`, an operand isn't a resolvable number, or the widths already match), letting the
 * caller fall back to the plain, uncoerced rendering.
 */
const applyNumericCoercion = (
  node: ts.BinaryExpression,
  operatorText: string,
  leftCode: string,
  rightCode: string,
  adapter: ILanguageAdapter,
  numericContext: INumericTypeContext | undefined,
): string | undefined => {
  if (!numericContext) return;
  const leftInfo = resolveVariableInfo(node.left, numericContext);
  const rightInfo = resolveVariableInfo(node.right, numericContext);
  if (leftInfo?.type !== 'number' || rightInfo?.type !== 'number') return;
  const promoted = promoteNumberType(leftInfo.numberType, rightInfo.numberType);
  if (!promoted) return;
  const castLeft = adapter.castNumericOperand(leftCode, leftInfo.numberType, promoted);
  const castRight = adapter.castNumericOperand(rightCode, rightInfo.numberType, promoted);
  return `${castLeft} ${adapter.mapBinaryOperator(operatorText)} ${castRight}`;
};

const unwrapParens = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) ? unwrapParens(node.expression) : node;

const resolveNumberTypeOf = (node: ts.Expression, numericContext: INumericTypeContext | undefined) => {
  const info = numericContext && resolveVariableInfo(node, numericContext);
  if (info && info.type === 'number') return info.numberType;
};

/** No decimal point or exponent in the literal's exact source spelling — see `IEmitAssignmentParams.rightIsIntegerLiteral`'s own doc comment for why Rust's `emitAssignment` needs this. */
const isIntegerLookingLiteral = (node: ts.Expression, sourceFile: ts.SourceFile): boolean => {
  const unwrapped = unwrapParens(node);
  return ts.isNumericLiteral(unwrapped) && !/[.eE]/.test(unwrapped.getText(sourceFile));
};

/**
 * Walks a (already type-checked) TypeScript expression AST and emits it in the target language
 * described by `adapter` — the whitelist+per-language-mapping mechanism from ADR 0019 (private).
 * Only the node kinds every adapter needs are handled here (literals, identifiers, the common
 * operators, property access, calls); anything else throws `UnsupportedConstructError` uniformly, so
 * an adapter never has to special-case "this whole shape of expression isn't supported at all".
 */
/**
 * Splits a real TS template literal (`` `head${expr}tail` ``, or a plain `` `text` `` with no
 * interpolation) into the literal/expr segments `ILanguageAdapter.emitTemplateLiteral` takes.
 */
const buildTemplateLiteralSegments = (
  node: ts.TemplateLiteral,
  emit: (child: ts.Expression) => string,
): ITemplateLiteralSegment[] => {
  const segments: ITemplateLiteralSegment[] = [];
  if (ts.isNoSubstitutionTemplateLiteral(node)) {
    if (node.text !== '') segments.push({ isExpr: false, text: node.text });
    return segments;
  }
  if (node.head.text !== '') segments.push({ isExpr: false, text: node.head.text });
  for (const span of node.templateSpans) {
    segments.push({ isExpr: true, text: emit(span.expression) });
    if (span.literal.text !== '') segments.push({ isExpr: false, text: span.literal.text });
  }
  return segments;
};

/**
 * Emits a whole `ts.TemplateLiteral` node, pulled out of `emitPortableExpression` itself purely to
 * keep that function's own branch count (and this repo's `eslint(complexity)` budget) in check — the
 * two functions are otherwise inseparable, `emit` being `emitPortableExpression`'s own recursive
 * closure.
 */
const emitTemplateLiteralExpression = (
  node: ts.TemplateLiteral,
  adapter: ILanguageAdapter,
  emit: (child: ts.Expression) => string,
): string => {
  if (!adapter.emitTemplateLiteral) {
    throw new UnsupportedConstructError(`Template literals are not portable to ${adapter.target}`);
  }
  return adapter.emitTemplateLiteral({ segments: buildTemplateLiteralSegments(node, emit) });
};

/** Pulled out of `emitPortableExpression` for the same `eslint(complexity)`-budget reason `emitTemplateLiteralExpression` was. */
const emitBinaryExpressionNode = (
  node: ts.BinaryExpression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  adapter: ILanguageAdapter,
  numericContext: INumericTypeContext | undefined,
  emit: (child: ts.Expression) => string,
): string => {
  const operatorText = ts.tokenToString(node.operatorToken.kind);
  if (!operatorText) throw new UnsupportedConstructError(`Unsupported binary operator token for ${adapter.target}`);
  if (operatorText === '=') {
    return adapter.emitAssignment({
      leftCode: emit(node.left),
      leftType: checker.getTypeAtLocation(node.left),
      leftNumberType: resolveNumberTypeOf(node.left, numericContext),
      rightCode: emit(node.right),
      rightIsIntegerLiteral: isIntegerLookingLiteral(node.right, sourceFile),
      rightVariableInfo: numericContext && resolveVariableInfo(node.right, numericContext),
      checker,
    });
  }
  const leftCode = emit(node.left);
  const rightCode = emit(node.right);
  const coerced = applyNumericCoercion(node, operatorText, leftCode, rightCode, adapter, numericContext);
  return coerced ?? `${leftCode} ${adapter.mapBinaryOperator(operatorText)} ${rightCode}`;
};

export const emitPortableExpression = (
  node: ts.Expression,
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  adapter: ILanguageAdapter,
  numericContext?: INumericTypeContext,
): string => {
  const emit = (child: ts.Expression): string =>
    emitPortableExpression(child, sourceFile, checker, adapter, numericContext);

  if (ts.isParenthesizedExpression(node)) {
    return `(${emit(node.expression)})`;
  }
  if (ts.isStringLiteral(node)) {
    return adapter.formatStringLiteral(node.text);
  }
  if (ts.isTemplateLiteral(node)) {
    return emitTemplateLiteralExpression(node, adapter, emit);
  }
  if (ts.isNumericLiteral(node)) {
    // `node.text` (not used here) is TypeScript's *normalized* numeric value — `5.0` becomes `"5"`,
    // `1e7` becomes `"10000000"`, `0xFF` becomes `"255"` — the scanner strips exactly the formatting
    // (decimal point, exponent, hex/octal/binary base) that distinguishes an int-looking literal from
    // a float-looking one. Every adapter's `formatNumericLiteral` mostly passes this straight through,
    // so on cpp/Go/C# (which all implicitly convert an integer literal to a float-typed context) the
    // normalization is harmless — but Rust's integer-literal and float-literal *tokens* are distinct
    // kinds with no implicit conversion between them (see `montecarlo-project.fixture.ts`'s own top
    // comment for the real compile error this caused), so losing the `.0` here silently produces
    // invalid Rust. `node.getText(sourceFile)` preserves the literal's exact original spelling instead.
    return adapter.formatNumericLiteral(node.getText(sourceFile));
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return adapter.formatBooleanLiteral(true);
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return adapter.formatBooleanLiteral(false);
  }
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const operatorText = ts.tokenToString(node.operator);
    if (!operatorText) throw new UnsupportedConstructError(`Unsupported unary operator token for ${adapter.target}`);
    return `${adapter.mapUnaryOperator(operatorText)}${emit(node.operand)}`;
  }
  if (ts.isBinaryExpression(node)) {
    return emitBinaryExpressionNode(node, sourceFile, checker, adapter, numericContext, emit);
  }
  if (ts.isConditionalExpression(node)) {
    return adapter.emitConditional({
      conditionCode: emit(node.condition),
      whenTrueCode: emit(node.whenTrue),
      whenFalseCode: emit(node.whenFalse),
    });
  }
  if (ts.isPropertyAccessExpression(node)) {
    return adapter.emitPropertyAccess({
      receiverCode: emit(node.expression),
      propertyName: node.name.text,
      receiverType: checker.getTypeAtLocation(node.expression),
      checker,
    });
  }
  if (ts.isCallExpression(node)) {
    return adapter.emitCall({
      qualifiedCalleeText: node.expression.getText(sourceFile),
      argCodes: node.arguments.map(emit),
    });
  }
  if (ts.isArrayLiteralExpression(node)) {
    if (!adapter.emitArrayLiteral) {
      throw new UnsupportedConstructError(`Array literals are not portable to ${adapter.target}`);
    }
    return adapter.emitArrayLiteral({ elementCodes: node.elements.map(emit) });
  }
  if (ts.isElementAccessExpression(node)) {
    return adapter.emitElementAccess({
      receiverCode: emit(node.expression),
      indexCode: emit(node.argumentExpression),
      receiverType: checker.getTypeAtLocation(node.expression),
      checker,
    });
  }
  throw new UnsupportedConstructError(
    `Expression syntax not portable to ${adapter.target}: ${node.getText(sourceFile)}`,
  );
};
