import ts from 'typescript';
import type { ILanguageAdapter } from './language-adapter.js';
import type { IDecimalWalkEnv } from './walk-decimal.js';
import { emitMathArgument } from './walk-decimal.js';

/** Literals and identifiers; `null` for any other node. */
export const emitLeafExpression = (
  node: ts.Expression,
  sourceFile: ts.SourceFile,
  adapter: ILanguageAdapter,
): string | null => {
  if (ts.isStringLiteral(node)) {
    return adapter.formatStringLiteral(node.text);
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
  return null;
};

/** A call: a `Math.*` argument that is a decimal is converted to a float first (ADR 0069 (private) §4). */
export const emitCallExpression = (
  node: ts.CallExpression,
  sourceFile: ts.SourceFile,
  adapter: ILanguageAdapter,
  emit: (child: ts.Expression) => string,
  decimalEnv?: IDecimalWalkEnv,
): string => {
  const qualifiedCalleeText = node.expression.getText(sourceFile);
  const convertsDecimals = decimalEnv && qualifiedCalleeText.startsWith('Math.');
  return adapter.emitCall({
    qualifiedCalleeText,
    argCodes: node.arguments.map((argument) =>
      convertsDecimals ? emitMathArgument(argument, emit(argument), decimalEnv) : emit(argument),
    ),
  });
};
