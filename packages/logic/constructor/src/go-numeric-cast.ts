import type { TVariableInfo } from '@falang/typescript-dto';
import { needsNumericCast } from './numeric-coercion.js';
import { resolveExpressionNumberType } from './resolve-expression-number-type.js';
import type { IGoStatementContext } from './go-statement-context.js';

/** Go converts nothing implicitly: a number of a different resolved width than the declared type gets `T(...)` (a literal or unresolvable expression is left alone). */
export const castToDeclaredNumber = (
  code: string,
  expression: string,
  declared: TVariableInfo,
  goType: string,
  ctx: IGoStatementContext,
): string => {
  if (declared.type !== 'number') return code;
  const resolved = resolveExpressionNumberType({
    expression,
    scope: ctx.scope,
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
  });
  return needsNumericCast(resolved, declared.numberType) ? `${goType}(${code})` : code;
};
