import ts from 'typescript';

const COMPOUND_OPERATORS: ReadonlyMap<ts.SyntaxKind, string> = new Map([
  [ts.SyntaxKind.PlusEqualsToken, '+'],
  [ts.SyntaxKind.MinusEqualsToken, '-'],
  [ts.SyntaxKind.AsteriskEqualsToken, '*'],
  [ts.SyntaxKind.SlashEqualsToken, '/'],
  [ts.SyntaxKind.PercentEqualsToken, '%'],
]);

/**
 * An `action` whose whole text is an increment, a decrement or a compound assignment — `x++`, `--x`, `a[i].n += 2`,
 * `x *= k` — as the plain assignment `x = x + 1` / `x = x * (k)`. That is the one store form every target compiles
 * (Go allows `++`/`--` only as statements, Rust has none, and the adapters map no compound operator) and it goes
 * through the usual numeric-cast and decimal-store handling. The operand is evaluated twice, which is harmless for
 * the expressions the portable subset allows (no side-effecting calls). Anything else is returned unchanged: inside
 * a larger expression the value of `x++` matters, so it is not rewritten there.
 */
export const lowerIncrementStatement = (raw: string): string => {
  const sourceFile = ts.createSourceFile('action.ts', raw, ts.ScriptTarget.ES2022, true);
  if (sourceFile.statements.length !== 1) return raw;
  const statement = sourceFile.statements[0];
  if (!ts.isExpressionStatement(statement)) return raw;
  const expression = statement.expression;
  if (ts.isBinaryExpression(expression)) {
    const operator = COMPOUND_OPERATORS.get(expression.operatorToken.kind);
    if (!operator) return raw;
    const target = expression.left.getText(sourceFile);
    return `${target} = ${target} ${operator} (${expression.right.getText(sourceFile)})`;
  }
  if (!ts.isPostfixUnaryExpression(expression) && !ts.isPrefixUnaryExpression(expression)) return raw;
  const { operator } = expression;
  if (operator !== ts.SyntaxKind.PlusPlusToken && operator !== ts.SyntaxKind.MinusMinusToken) return raw;
  const operand = expression.operand.getText(sourceFile);
  return `${operand} = ${operand} ${operator === ts.SyntaxKind.PlusPlusToken ? '+' : '-'} 1`;
};
