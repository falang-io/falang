import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { NodeCompileError } from './node-compile-error.js';
import { computeCycleInfo } from './cycle-info.js';
import {
  emitAction,
  emitArrInsert,
  emitArrPop,
  emitArrPush,
  emitArrShift,
  emitArrSlice,
  emitArrUnshift,
  emitBreak,
  emitCallApi,
  emitCallFunction,
  emitContinue,
  emitCreateVar,
  emitLog,
  emitReturn,
  emitThrow,
} from './cpp-leaf-emitters.js';
import {
  emitForeach,
  emitFromToCycle,
  emitIf,
  emitPseudoCycle,
  emitSwitch,
  emitWhile,
} from './cpp-control-flow-emitters.js';
import { withScope, wrapMarker, type ICppStatementContext, type TCompileChildren } from './cpp-statement-context.js';
import { applyCppDebugTrace } from './cpp-debug-trace.js';

export type {
  ICppCompileParams,
  ICppFunctionSignature,
  ICppStatementContext,
  ITraceEmitter,
  IDebugCompileOptions,
} from './cpp-statement-context.js';
export { computeCycleInfo } from './cycle-info.js';

interface IReturnBindingResult {
  readonly code: string;
  readonly returnBinding?: { readonly name: string; readonly type: TVariableInfo };
}

const withOptionalBinding = (ctx: ICppStatementContext, result: IReturnBindingResult): ICppStatementContext =>
  result.returnBinding ? withScope(ctx, result.returnBinding.name, result.returnBinding.type) : ctx;

const CONTROL_FLOW_EMITTERS: Record<
  string,
  (node: INode, ctx: ICppStatementContext, compile: TCompileChildren) => string
> = {
  if: emitIf,
  switch: emitSwitch,
  foreach: emitForeach,
  'from-to-cycle': emitFromToCycle,
  while: emitWhile,
  'pseudo-cycle': emitPseudoCycle,
};

const LEAF_EMITTERS: Record<string, (node: INode, ctx: ICppStatementContext) => string> = {
  action: emitAction,
  log: emitLog,
  return: emitReturn,
  throw: emitThrow,
  break: emitBreak,
  continue: emitContinue,
  'arr-push': emitArrPush,
  'arr-unshift': emitArrUnshift,
  'arr-insert': emitArrInsert,
};

const BINDING_EMITTERS: Record<string, (node: INode, ctx: ICppStatementContext) => IReturnBindingResult> = {
  'call-function': emitCallFunction,
  'call-api': emitCallApi,
  'arr-pop': emitArrPop,
  'arr-shift': emitArrShift,
  'arr-slice': emitArrSlice,
};

/**
 * Compiles a (possibly nested) statement list to C++, folding `scope` across sibling statements
 * (a `create-var`/`call-function`-with-`returnVariable`/etc. extends `ctx.scope` for every
 * statement *after* it, but never leaks back up to whatever list is compiling *this* list's own
 * container). Self-recursive (via the `compile` callback threaded into control-flow emitters, see
 * `TCompileChildren`) rather than split into a separate top-level dispatch function — keeps the one
 * true recursive edge as a self-reference instead of two mutually-referencing bindings.
 */
export const compileStatementList = (nodes: readonly INode[], ctx: ICppStatementContext): string => {
  const compileOneStatementIn = (
    node: INode,
    statementCtx: ICppStatementContext,
  ): { code: string; nextCtx: ICppStatementContext } => {
    const wrap = (code: string, nextCtx: ICppStatementContext): { code: string; nextCtx: ICppStatementContext } => ({
      code: wrapMarker(node, applyCppDebugTrace(node, code, statementCtx)),
      nextCtx,
    });
    if (node.name === 'create-var') {
      const data = node.data as { name: string; variableType: TVariableInfo };
      return wrap(emitCreateVar(node, statementCtx), withScope(statementCtx, data.name, data.variableType));
    }
    const bindingEmitter = BINDING_EMITTERS[node.name];
    if (bindingEmitter) {
      const result = bindingEmitter(node, statementCtx);
      return wrap(result.code, withOptionalBinding(statementCtx, result));
    }
    const leafEmitter = LEAF_EMITTERS[node.name];
    if (leafEmitter) return wrap(leafEmitter(node, statementCtx), statementCtx);
    const controlFlowEmitter = CONTROL_FLOW_EMITTERS[node.name];
    if (controlFlowEmitter) {
      const compile: TCompileChildren = (childNodes, options) =>
        compileStatementList(childNodes, {
          ...statementCtx,
          scope: options?.scopeOverrides ? { ...statementCtx.scope, ...options.scopeOverrides } : statementCtx.scope,
          nesting: options?.nesting ?? statementCtx.nesting,
        });
      return wrap(controlFlowEmitter(node, statementCtx, compile), statementCtx);
    }
    if (node.name === 'parallel') {
      // Not implemented for the cpp target — matches the old app's own cpp builder, which threw the
      // same "not implemented" for `parallel` (no cross-language-portable concurrency primitive was
      // ever designed for it there either).
      throw new Error('parallel is not implemented for the C++ target');
    }
    throw new Error(`No C++ compiler emitter registered for node "${node.name}"`);
  };

  const lines: string[] = [];
  let currentCtx = ctx;
  for (const node of nodes) {
    try {
      const { code, nextCtx } = compileOneStatementIn(node, currentCtx);
      if (code !== '') lines.push(code);
      currentCtx = nextCtx;
    } catch (error) {
      if (error instanceof NodeCompileError) throw error;
      throw new NodeCompileError(node.id, error instanceof Error ? error.message : String(error));
    }
  }
  return lines.join('\n');
};

/**
 * Compiles a function body's statement list to C++ — the cpp-target analogue of
 * `@falang/workflow-compiler`'s `compileStatements`. `scope` should already include the function's
 * own parameters (see `compile-cpp-function.ts`, which also computes `cycleInfo` up front via
 * `computeCycleInfo` since it also needs it to decide which bookkeeping variables to declare).
 */
export const compileCppStatements = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>>,
  params: ICppStatementContext['params'],
): string => {
  const cycleInfo = computeCycleInfo(nodes);
  return compileStatementList(nodes, { scope, nesting: [], cycleInfo, params });
};
