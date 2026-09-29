import type { INode } from '@falang/dto';
import type { IScopeVariable, TScopeVariableType } from '@falang/typescript-common';
import { variableInfoToTsType } from '@falang/typescript-dto';
import { DEBUG_TRACE_CALL } from './debug-runtime.js';

/** One instrumented statement's static metadata — the runtime part (values) is filled in at execution time; see `@falang/debug`'s `IDebugTracePoint`. */
export interface IDebugTraceSite {
  readonly index: number;
  readonly documentId: string;
  readonly nodeId: string;
  readonly variables: readonly { readonly name: string; readonly type: string }[];
}

/**
 * Instruments the compiled statements of one document for debugging (see `debug-runtime.ts` and
 * ADR 0021 (private) §4). `allocateIndex` is shared across the whole project
 * (see `compile-project.ts`) so trace-point indexes are dense and globally unique; `onTracePoint` is
 * called once per emitted trace point, in compile order, to assemble the project's `IDebugMap`.
 */
export interface IDebugEmitOptions {
  readonly documentId: string;
  readonly allocateIndex: () => number;
  readonly onTracePoint: (site: IDebugTraceSite) => void;
}

const scopeVariableTypeToString = (type: TScopeVariableType): string =>
  type.type === 'raw' ? type.expression : variableInfoToTsType(type);

const buildScopeObjectLiteral = (scope: readonly IScopeVariable[]): string =>
  scope.length === 0 ? '{}' : `{ ${scope.map((variable) => variable.name).join(', ')} }`;

/**
 * Emits `await __falangDebug.trace(<idx>, () => ({...scope}))` for one statement node and records
 * its static metadata via `onTracePoint`. `scope` is the set of variables visible *before* this
 * node's own statement runs — critically, it never includes a variable the node itself declares
 * (e.g. `create-var`'s own `let x: T;`), since that binding doesn't exist yet at this point in the
 * generated code and referencing it inside the snapshot closure would be a TDZ error.
 */
export const emitDebugTrace = (node: INode, scope: readonly IScopeVariable[], debug: IDebugEmitOptions): string => {
  const index = debug.allocateIndex();
  debug.onTracePoint({
    index,
    documentId: debug.documentId,
    nodeId: node.id,
    variables: scope.map((variable) => ({ name: variable.name, type: scopeVariableTypeToString(variable.type) })),
  });
  return `await ${DEBUG_TRACE_CALL}(${index}, () => (${buildScopeObjectLiteral(scope)}));`;
};
