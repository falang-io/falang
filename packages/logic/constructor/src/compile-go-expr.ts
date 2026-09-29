import { compileExpression } from './compile-expression.js';
import { NodeCompileError } from './node-compile-error.js';
import type { IGoStatementContext } from './go-statement-context.js';

/** Compiles one raw expression-text field to Go against the current scope — the Go-target analogue of `compile-cpp-expr.ts`'s `compileExpr`. */
export const compileGoExpr = (expression: string, ctx: IGoStatementContext, nodeId: string): string => {
  const result = compileExpression({
    expression,
    scope: ctx.scope,
    target: 'golang',
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
  });
  if (!result.ok) throw new NodeCompileError(nodeId, result.diagnostics.join('\n'));
  return result.code;
};
