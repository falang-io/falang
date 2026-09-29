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
} from './ts-leaf-emitters.js';
import {
  emitForeach,
  emitFromToCycle,
  emitIf,
  emitPseudoCycle,
  emitSwitch,
  emitWhile,
} from './ts-control-flow-emitters.js';
import { withScope, wrapMarker, type ITsStatementContext, type TCompileChildren } from './ts-statement-context.js';

export type {
  ITsApiEndpoint,
  ITsCompileParams,
  ITsFunctionSignature,
  ITsStatementContext,
} from './ts-statement-context.js';

interface IReturnBindingResult {
  readonly code: string;
  readonly returnBinding?: { readonly name: string; readonly type: TVariableInfo };
}

const withOptionalBinding = (ctx: ITsStatementContext, result: IReturnBindingResult): ITsStatementContext =>
  result.returnBinding ? withScope(ctx, result.returnBinding.name, result.returnBinding.type) : ctx;

const CONTROL_FLOW_EMITTERS: Record<
  string,
  (node: INode, ctx: ITsStatementContext, compile: TCompileChildren) => string
> = {
  if: emitIf,
  switch: emitSwitch,
  foreach: emitForeach,
  'from-to-cycle': emitFromToCycle,
  while: emitWhile,
  'pseudo-cycle': emitPseudoCycle,
};

const LEAF_EMITTERS: Record<string, (node: INode, ctx: ITsStatementContext) => string> = {
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

const BINDING_EMITTERS: Record<string, (node: INode, ctx: ITsStatementContext) => IReturnBindingResult> = {
  'call-function': emitCallFunction,
  'call-api': emitCallApi,
  'arr-pop': emitArrPop,
  'arr-shift': emitArrShift,
  'arr-slice': emitArrSlice,
};

/**
 * Compiles a (possibly nested) statement list to TS — the TS-target analogue of
 * `compile-go-statements.ts`'s `compileGoStatementList`. Same shape as the Go version (no `cycleInfo`
 * pre-pass either, for the same reason: real labeled `break`/`continue` needs no bookkeeping counters,
 * see `ts-statement-context.ts`).
 */
export const compileTsStatementList = (nodes: readonly INode[], ctx: ITsStatementContext): string => {
  const compileOneStatementIn = (
    node: INode,
    statementCtx: ITsStatementContext,
  ): { code: string; nextCtx: ITsStatementContext } => {
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
        compileTsStatementList(childNodes, {
          ...statementCtx,
          scope: options?.scopeOverrides ? { ...statementCtx.scope, ...options.scopeOverrides } : statementCtx.scope,
          loopLabels: options?.loopLabels ?? statementCtx.loopLabels,
        });
      return { code: wrapMarker(node, controlFlowEmitter(node, statementCtx, compile)), nextCtx: statementCtx };
    }
    if (node.name === 'parallel') {
      // Not implemented for the TS target either — same posture as every other target (see
      // `compile-go-statements.ts`'s own comment); no cross-language-portable concurrency primitive
      // was ever designed for it.
      throw new Error('parallel is not implemented for the TS target');
    }
    throw new Error(`No TS compiler emitter registered for node "${node.name}"`);
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
 * Compiles a function body's statement list to TS — the TS-target analogue of
 * `compile-go-statements.ts`'s own `compileGoStatements`. `scope` should already include the
 * function's own parameters (plus the auto-declared `returnValue`, see `compile-ts-function.ts`).
 */
export const compileTsStatements = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>>,
  params: ITsStatementContext['params'],
): string =>
  compileTsStatementList(nodes, { scope, loopLabels: [], usedLabels: new Set(), counter: { value: 0 }, params });
