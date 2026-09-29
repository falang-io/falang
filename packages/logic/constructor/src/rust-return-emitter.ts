import type { INode } from '@falang/dto';
import { compileRustExpr } from './compile-rust-expr.js';
import { resolveExpressionNumberType } from './resolve-expression-number-type.js';
import { variableInfoToRustType } from './rust-type-name.js';
import { widthOf } from './numeric-coercion.js';
import type { IRustStatementContext } from './rust-statement-context.js';

/**
 * The Rust analogue of `sharp-value.ts`'s `toSharpTypedValue`, scoped to numbers only: Rust has no
 * implicit conversion on `return` either (unlike C++'s implicit narrowing), so a `return` expression
 * whose own resolved width doesn't match the function's declared `returnValue` needs an explicit `as`
 * cast. Casts only when the widths actually differ (see `numeric-coercion.ts`'s `widthOf`) — an
 * already-matching return keeps its exact previous output, so no existing generated-code assertion
 * changes. Split into its own file (rather than living in `rust-leaf-emitters.ts` alongside every
 * other leaf emitter) purely to stay under `oxlint`'s `max-lines`.
 */
const castReturnExprIfNeeded = (code: string, expression: string, ctx: IRustStatementContext): string => {
  if (ctx.returnValue?.type !== 'number') return code;
  const resolvedNumberType = resolveExpressionNumberType({
    expression,
    scope: ctx.scope,
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
  });
  if (!resolvedNumberType || widthOf(resolvedNumberType) === widthOf(ctx.returnValue.numberType)) return code;
  return `(${code}) as ${variableInfoToRustType(ctx.returnValue, new Map(ctx.params.structNames), ctx.params.structDocuments)}`;
};

export const emitReturn = (node: INode, ctx: IRustStatementContext): string => {
  const expression = ((node.data as string | undefined) ?? '').trim();
  if (expression === '') return 'return;';
  const code = compileRustExpr(expression, ctx, node.id);
  return `return ${castReturnExprIfNeeded(code, expression, ctx)};`;
};
