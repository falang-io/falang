import { compileExpression } from './compile-expression.js';
import { NodeCompileError } from './node-compile-error.js';
import type { IRustStatementContext } from './rust-statement-context.js';

/** Compiles one raw expression-text field to Rust against the current scope — the Rust-target analogue of `compile-go-expr.ts`'s `compileGoExpr`. */
export const compileRustExpr = (expression: string, ctx: IRustStatementContext, nodeId: string): string => {
  const result = compileExpression({
    expression,
    scope: ctx.scope,
    target: 'rust',
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
  });
  if (!result.ok) throw new NodeCompileError(nodeId, result.diagnostics.join('\n'));
  return result.code;
};
