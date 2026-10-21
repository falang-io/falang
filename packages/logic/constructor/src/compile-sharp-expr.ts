import type { TVariableInfo } from '@falang/typescript-dto';
import { compileExpression } from './compile-expression.js';
import { NodeCompileError } from './node-compile-error.js';
import type { ISharpStatementContext } from './sharp-statement-context.js';

/** Compiles one raw expression-text field to C# against the current scope — the C#-target analogue of `compile-cpp-expr.ts`'s `compileExpr` (same "throw a `NodeCompileError` rather than return a result object" posture, so statement emitters need no per-field diagnostic boilerplate). */
const compileWith = (
  expression: string,
  ctx: ISharpStatementContext,
  nodeId: string,
  targetType: TVariableInfo | null,
  print: boolean,
): string => {
  const result = compileExpression({
    expression,
    scope: ctx.scope,
    target: 'sharp',
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
    ...(targetType ? { targetType } : {}),
    print,
  });
  if (!result.ok) throw new NodeCompileError(nodeId, result.diagnostics.join('\n'));
  return result.code;
};

export const compileSharpExpr = (
  expression: string,
  ctx: ISharpStatementContext,
  nodeId: string,
  targetType?: TVariableInfo,
): string => compileWith(expression, ctx, nodeId, targetType ?? null, false);

/** The expression's value is printed (`log`): a decimal gets exactly its scale's fraction digits (ADR 0069 (private) §4). */
export const compileSharpExprForPrint = (expression: string, ctx: ISharpStatementContext, nodeId: string): string =>
  compileWith(expression, ctx, nodeId, null, true);
