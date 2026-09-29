import { compileExpressionWithAdapter } from './compile-expression.js';
import { NodeCompileError } from './node-compile-error.js';
import type { ICppStatementContext } from './cpp-statement-context.js';

/** Compiles one raw expression-text field (e.g. `create-var`'s `value`, `if`'s condition) to C++-family source against the current scope — every statement emitter's only way to turn user-typed TS-subset text into portable text (see `compile-expression.ts`/ADR 0019 (private)). Uses `ctx.params.adapter` rather than hardcoding `cppAdapter`, so this whole statement compiler is reusable for a different C++-family target (e.g. Arduino) just by passing a different adapter — see `ICppCompileParams`. Throws `NodeCompileError` (not a `{ ok: false }` result) so callers don't need their own diagnostic-handling boilerplate per field. */
export const compileExpr = (expression: string, ctx: ICppStatementContext, nodeId: string): string => {
  const result = compileExpressionWithAdapter({
    expression,
    scope: ctx.scope,
    adapter: ctx.params.adapter,
    structNames: new Map(ctx.params.structNames),
    structDefinitions: ctx.params.structDefinitions,
    extraDeclarations: ctx.params.extraDeclarations,
  });
  if (!result.ok) throw new NodeCompileError(nodeId, result.diagnostics.join('\n'));
  return result.code;
};
