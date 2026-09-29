import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { NodeCompileError } from './node-compile-error.js';
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
} from './go-leaf-emitters.js';
import {
  emitForeach,
  emitFromToCycle,
  emitIf,
  emitPseudoCycle,
  emitSwitch,
  emitWhile,
} from './go-control-flow-emitters.js';
import { withScope, wrapMarker, type IGoStatementContext, type TCompileChildren } from './go-statement-context.js';

export type { IGoCompileParams, IGoFunctionSignature, IGoStatementContext } from './go-statement-context.js';

interface IReturnBindingResult {
  readonly code: string;
  readonly returnBinding?: { readonly name: string; readonly type: TVariableInfo };
}

const withOptionalBinding = (ctx: IGoStatementContext, result: IReturnBindingResult): IGoStatementContext =>
  result.returnBinding ? withScope(ctx, result.returnBinding.name, result.returnBinding.type) : ctx;

const CONTROL_FLOW_EMITTERS: Record<
  string,
  (node: INode, ctx: IGoStatementContext, compile: TCompileChildren) => string
> = {
  if: emitIf,
  switch: emitSwitch,
  foreach: emitForeach,
  'from-to-cycle': emitFromToCycle,
  while: emitWhile,
  'pseudo-cycle': emitPseudoCycle,
};

const LEAF_EMITTERS: Record<string, (node: INode, ctx: IGoStatementContext) => string> = {
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

const BINDING_EMITTERS: Record<string, (node: INode, ctx: IGoStatementContext) => IReturnBindingResult> = {
  'call-function': emitCallFunction,
  'call-api': emitCallApi,
  'arr-pop': emitArrPop,
  'arr-shift': emitArrShift,
  'arr-slice': emitArrSlice,
};

/**
 * Compiles a (possibly nested) statement list to Go — the Go-target analogue of
 * `compile-cpp-statements.ts`'s `compileStatementList`. Simpler than the cpp version in one real
 * way: no `cycleInfo` pre-pass or bookkeeping-variable folding, since Go's real labeled
 * `break`/`continue` (see `go-statement-context.ts`) needs no counters — `ctx.loopLabels`/
 * `ctx.usedLabels` (mutated by `go-leaf-emitters.ts`'s `emitBreak`/`emitContinue`) is all a loop
 * needs to know whether to print its own label.
 */
export const compileGoStatementList = (nodes: readonly INode[], ctx: IGoStatementContext): string => {
  const compileOneStatementIn = (
    node: INode,
    statementCtx: IGoStatementContext,
  ): { code: string; nextCtx: IGoStatementContext } => {
    if (node.name === 'create-var') {
      const data = node.data as { name: string; variableType: TVariableInfo };
      return {
        code: wrapMarker(node, emitCreateVar(node, statementCtx)),
        nextCtx: withScope(statementCtx, data.name, data.variableType),
      };
    }
    const bindingEmitter = BINDING_EMITTERS[node.name];
    if (bindingEmitter) {
      const result = bindingEmitter(node, statementCtx);
      return { code: wrapMarker(node, result.code), nextCtx: withOptionalBinding(statementCtx, result) };
    }
    const leafEmitter = LEAF_EMITTERS[node.name];
    if (leafEmitter) return { code: wrapMarker(node, leafEmitter(node, statementCtx)), nextCtx: statementCtx };
    const controlFlowEmitter = CONTROL_FLOW_EMITTERS[node.name];
    if (controlFlowEmitter) {
      const compile: TCompileChildren = (childNodes, options) =>
        compileGoStatementList(childNodes, {
          ...statementCtx,
          scope: options?.scopeOverrides ? { ...statementCtx.scope, ...options.scopeOverrides } : statementCtx.scope,
          loopLabels: options?.loopLabels ?? statementCtx.loopLabels,
        });
      return { code: wrapMarker(node, controlFlowEmitter(node, statementCtx, compile)), nextCtx: statementCtx };
    }
    if (node.name === 'parallel') {
      // Not implemented for the Go target, same posture as the cpp target — no cross-language-
      // portable concurrency primitive was ever designed for it (the old app's own Go codegen never
      // implemented `parallel` either).
      throw new Error('parallel is not implemented for the Go target');
    }
    throw new Error(`No Go compiler emitter registered for node "${node.name}"`);
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
 * Compiles a function body's statement list to Go — the Go-target analogue of
 * `compile-cpp-statements.ts`'s `compileCppStatements`. `scope` should already include the
 * function's own parameters (see `compile-go-function.ts`).
 */
export const compileGoStatements = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>>,
  params: IGoStatementContext['params'],
): string =>
  compileGoStatementList(nodes, { scope, loopLabels: [], usedLabels: new Set(), labelCounter: { value: 0 }, params });
