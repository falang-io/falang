import type { IArrayTypeInfo, TVariableInfo } from '@falang/typescript-dto';
import {
  buildVirtualFileText,
  createCheckedProgram,
  findExprInitializer,
  getDiagnosticMessages,
} from './compile-expression.js';
import { resolveVariableInfo } from './numeric-coercion.js';
import { NodeCompileError } from './node-compile-error.js';
import type { ITsStatementContext } from './ts-statement-context.js';

/**
 * Resolves an arbitrary expression's own DSL-level array type (element type + dimensions) for
 * `foreach`'s header and every `arr-*` node. Unlike Go/cpp's own equivalent (`go-leaf-emitters.ts`'s
 * `resolveArrayIdentifierType`, restricted to a bare identifier already in `scope`), this handles a
 * nested property-access path too (`state.snake.body`) — a real gap only found by actually
 * type-checking the real `snake` fixture project against this compiler (see ADR 0019 (private)'s
 * "TypeScript target" implementation notes; every `arr`-typed field that project's own documents pass
 * is a nested path like this, never a bare identifier, so the Go-style restriction would have rejected
 * every single one of them).
 *
 * Reuses `numeric-coercion.ts`'s own `resolveVariableInfo` — already general-purpose despite that
 * file's name (its identifier/property-access/element-access branches return the expression's full
 * `TVariableInfo`; only `resolveExpressionNumberType`, its one existing caller, narrows the result to
 * numbers) — via the same "re-parse the expression through a fresh checked virtual file, independently
 * of whatever `compileTsExpr` call the caller already made for the same text" posture that function's
 * own doc comment already establishes.
 */
export const resolveTsArrayType = (
  expression: string,
  ctx: ITsStatementContext,
  nodeId: string,
): TVariableInfo & IArrayTypeInfo => {
  const fileText = buildVirtualFileText(
    expression,
    ctx.scope,
    new Map(ctx.params.structNames),
    ctx.params.structDefinitions,
  );
  const { program, sourceFile } = createCheckedProgram(fileText);
  const fail = (): never => {
    throw new NodeCompileError(nodeId, `"${expression}" must resolve to an array type for TS compilation`);
  };
  if (getDiagnosticMessages(program).length > 0) return fail();
  const resolved = resolveVariableInfo(findExprInitializer(sourceFile), {
    scope: ctx.scope,
    structDefinitions: ctx.params.structDefinitions,
  });
  if (!resolved || resolved.type !== 'array') return fail();
  return resolved;
};
