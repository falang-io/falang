import { compileExpression } from './compile-expression.js';
import { NodeCompileError } from './node-compile-error.js';
import type { ISharpStatementContext } from './sharp-statement-context.js';

/** Compiles one raw expression-text field to C# against the current scope — the C#-target analogue of `compile-cpp-expr.ts`'s `compileExpr` (same "throw a `NodeCompileError` rather than return a result object" posture, so statement emitters need no per-field diagnostic boilerplate). */
export const compileSharpExpr = (expression: string, ctx: ISharpStatementContext, nodeId: string): string => {
  const result = compileExpression({
    expression,
    scope: ctx.scope,
    target: 'sharp',
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
  });
  if (!result.ok) throw new NodeCompileError(nodeId, result.diagnostics.join('\n'));
  return result.code;
};
