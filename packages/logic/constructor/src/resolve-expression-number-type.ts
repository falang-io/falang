import type { TNumberTypeDetail, TVariableInfo } from '@falang/typescript-dto';
import {
  buildVirtualFileText,
  createCheckedProgram,
  findExprInitializer,
  getDiagnosticMessages,
} from './compile-expression.js';
import { resolveVariableInfo } from './numeric-coercion.js';
import type { IStructDefinition } from './struct-definition.js';

export interface IResolveExpressionNumberTypeParams {
  readonly expression: string;
  readonly scope: Readonly<Record<string, TVariableInfo>>;
  readonly structNames?: Map<string, string>;
  readonly structDefinitions?: ReadonlyMap<string, IStructDefinition>;
}

/**
 * Resolves the DSL-level number type of `expression`'s own top-level result, when resolvable — a
 * deliberately separate entry point rather than an extra field on `compileExpression`'s own result, so
 * that result's shape stays exactly what every existing caller/test already expects (adding a field
 * that's frequently *populated*, not just frequently `undefined`, broke a wide swath of exact-equality
 * `toEqual({ ok: true, code })` assertions the first time this was tried — see this function's own git
 * history). Used only by Go/Rust's statement-level `emitReturn` (`go-leaf-emitters.ts`/
 * `rust-return-emitter.ts`) to decide whether a returned value needs an explicit cast to the enclosing
 * function's declared return type — the same declared-type-boundary cast `sharp-value.ts`'s
 * `toSharpTypedValue` already applies for C#, needed here because Go/Rust (unlike C++/C#) have no
 * implicit narrowing on `return` either (see ADR 0019 (private)'s numeric-coercion follow-up).
 * Re-parses/re-type-checks `expression` independently of whatever `compileExpression` call the caller
 * already made for the same text — an acceptable small duplication given this only runs once per
 * `return` statement, not once per sub-expression. Returns `undefined` (rather than throwing) for a
 * `expression` that fails to type-check at all — the caller's own `compileExpression` call already
 * surfaces that failure as a proper diagnostic; this function only ever gets asked for the type of an
 * expression already known to compile. Split into its own file (rather than living in
 * `compile-expression.ts` alongside `compileExpression`/`compileExpressionWithAdapter`) purely to stay
 * under `oxlint`'s `max-lines`.
 */
export const resolveExpressionNumberType = ({
  expression,
  scope,
  structNames = new Map(),
  structDefinitions = new Map(),
}: IResolveExpressionNumberTypeParams): TNumberTypeDetail | undefined => {
  const fileText = buildVirtualFileText(expression, scope, structNames, structDefinitions);
  const { program, sourceFile } = createCheckedProgram(fileText);
  if (getDiagnosticMessages(program).length > 0) return;
  const exprNode = findExprInitializer(sourceFile);
  const resolvedInfo = resolveVariableInfo(exprNode, { scope, structDefinitions });
  if (resolvedInfo?.type === 'number') return resolvedInfo.numberType;
};
