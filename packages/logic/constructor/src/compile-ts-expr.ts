import { compileExpression } from './compile-expression.js';
import { NodeCompileError } from './node-compile-error.js';
import type { ITsStatementContext } from './ts-statement-context.js';

/**
 * Compiles one raw expression-text field against the current scope, targeting `ts` — the TS-target
 * analogue of `compile-go-expr.ts`'s `compileGoExpr`. `target: 'ts'` makes `compileExpression` take
 * its identity path (the expression is already real TypeScript, see `compile-expression.ts`'s own
 * `emitTs`): this call's only real job is the type-check (undeclared identifiers, type mismatches)
 * against `ctx.scope`, the same check the Monaco editor's hidden-scope prefix already runs at edit
 * time — a raw expression that doesn't type-check here fails the whole document's compile with a
 * `NodeCompileError` pointing at the offending node.
 */
export const compileTsExpr = (expression: string, ctx: ITsStatementContext, nodeId: string): string => {
  const result = compileExpression({
    expression,
    scope: ctx.scope,
    target: 'ts',
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
  });
  if (!result.ok) throw new NodeCompileError(nodeId, result.diagnostics.join('\n'));
  return result.code;
};
