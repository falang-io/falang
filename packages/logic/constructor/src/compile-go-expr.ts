import type { TVariableInfo } from '@falang/typescript-dto';
import { compileExpression } from './compile-expression.js';
import { NodeCompileError } from './node-compile-error.js';
import type { IGoStatementContext } from './go-statement-context.js';

/** Compiles one raw expression-text field to Go against the current scope — the Go-target analogue of `compile-cpp-expr.ts`'s `compileExpr`. */
const compileWith = (
  expression: string,
  ctx: IGoStatementContext,
  nodeId: string,
  targetType: TVariableInfo | null,
  print: boolean,
): string => {
  const result = compileExpression({
    expression,
    scope: ctx.scope,
    target: 'golang',
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
    ...(targetType ? { targetType } : {}),
    print,
  });
  if (!result.ok) throw new NodeCompileError(nodeId, result.diagnostics.join('\n'));
  return result.code;
};

export const compileGoExpr = (
  expression: string,
  ctx: IGoStatementContext,
  nodeId: string,
  targetType?: TVariableInfo,
): string => compileWith(expression, ctx, nodeId, targetType ?? null, false);

/** The expression's value is printed (`log`): a decimal gets exactly its scale's fraction digits (ADR 0069 (private) §4). */
export const compileGoExprForPrint = (expression: string, ctx: IGoStatementContext, nodeId: string): string =>
  compileWith(expression, ctx, nodeId, null, true);
