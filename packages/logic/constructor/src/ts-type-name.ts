import type { TVariableInfo } from '@falang/typescript-dto';
import { variableInfoToTsType } from '@falang/typescript-dto';
import type { IStructDefinition } from './struct-definition.js';
import { NodeCompileError } from './node-compile-error.js';

/**
 * Renders a `TVariableInfo` as a TS type name — a thin `ReadonlyMap`-accepting wrapper over
 * `@falang/typescript-dto`'s own `variableInfoToTsType` (whose `structNames` parameter is typed as a
 * mutable `Map`, matching `compile-expression.ts`'s own convention — see `compile-ts-expr.ts`'s
 * identical `new Map(...)` copy). Unlike `golang-type-name.ts`'s target-specific
 * `variableInfoToGoType`, TS needs no per-target rendering logic of its own: every DSL numeric width
 * collapses to the same TS `number` already, and struct/array/union are all handled by the upstream
 * renderer — this file exists only for the two TS-specific concerns `variableInfoToTsType` doesn't
 * cover: a function's `Promise<...>` return-type wrapper and a struct's fully-populated empty-value
 * literal (see `isVoidReturnValue`/`tsReturnTypeName`/`emitTsEmptyValue` below).
 */
export const variableInfoToTsTypeName = (type: TVariableInfo, structNames: ReadonlyMap<string, string>): string =>
  variableInfoToTsType(type, new Map(structNames));

/**
 * A function-body's `returnValue` is `undefined` in some hand-built fixtures but an explicit
 * `{ type: 'void' }` in every real, editor-authored document (`function-body`'s own DTO always
 * supplies it) — both mean "no real return value" and must be treated identically everywhere this
 * compiler decides whether to declare/return the auto-managed `returnValue` local (Contract 4,
 * `compile-ts-function.ts`) or reject a `call-function`/`call-api` binding a void call's result.
 */
export const isVoidReturnValue = (returnValue?: TVariableInfo): boolean => !returnValue || returnValue.type === 'void';

/** Every TS function this target compiles is `async` (`await`s `call-function`/`call-api`), so its declared return type is always a `Promise` — `Promise<void>` for a void function, matching the reference `code/ts` output's own `main`. */
export const tsReturnTypeName = (
  returnValue: TVariableInfo | undefined,
  structNames: ReadonlyMap<string, string>,
): string => {
  if (!returnValue || returnValue.type === 'void') return 'Promise<void>';
  return `Promise<${variableInfoToTsTypeName(returnValue, structNames)}>`;
};

/**
 * Recursively renders a TS literal expression that's a *fully populated* safe initial value for a
 * variable of the given type — needed for `create-var` without a value and for the auto-declared
 * `returnValue` local (Contract 4) alike. Deliberately NOT `@falang/typescript-dto`'s own
 * `defaultValueExpression`, which renders a bare `{}` for any struct type: that's fine for its own
 * caller (a Monaco editor default, never type-checked against the struct's own interface), but a bare
 * `{}` assigned to a `let x: GameState = {}` fails `tsc --strict` outright (missing every declared
 * property) — this instead ports the old app's own `generateEmptyValue.ts`, walking
 * `structDefinitions` to fill in every field, recursively, so the literal always satisfies its
 * declared interface.
 */
export const emitTsEmptyValue = (
  type: TVariableInfo,
  structDefinitions: ReadonlyMap<string, IStructDefinition>,
  nodeId: string,
): string => {
  switch (type.type) {
    case 'number': {
      return '0';
    }
    case 'string': {
      return "''";
    }
    case 'boolean': {
      return 'false';
    }
    case 'array': {
      return '[]';
    }
    case 'struct': {
      const definition = structDefinitions.get(type.id);
      if (!definition) throw new NodeCompileError(nodeId, `Unknown struct id for TS empty-value: ${type.id}`);
      const fields = Object.entries(definition.properties)
        .map(
          ([propertyName, propertyType]) =>
            `${propertyName}:${emitTsEmptyValue(propertyType, structDefinitions, nodeId)}`,
        )
        .join(',');
      return `{${fields}}`;
    }
    default: {
      throw new NodeCompileError(nodeId, `No empty value for TS compilation: ${type.type}`);
    }
  }
};
