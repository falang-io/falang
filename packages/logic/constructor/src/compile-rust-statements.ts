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
  emitThrow,
} from './rust-leaf-emitters.js';
import { emitReturn } from './rust-return-emitter.js';
import {
  emitForeach,
  emitFromToCycle,
  emitIf,
  emitPseudoCycle,
  emitSwitch,
  emitWhile,
} from './rust-control-flow-emitters.js';
import { withScope, wrapMarker, type IRustStatementContext, type TCompileChildren } from './rust-statement-context.js';

export type { IRustCompileParams, IRustFunctionSignature, IRustStatementContext } from './rust-statement-context.js';

interface IReturnBindingResult {
  readonly code: string;
  readonly returnBinding?: { readonly name: string; readonly type: TVariableInfo };
}

const withOptionalBinding = (ctx: IRustStatementContext, result: IReturnBindingResult): IRustStatementContext =>
  result.returnBinding ? withScope(ctx, result.returnBinding.name, result.returnBinding.type) : ctx;

const CONTROL_FLOW_EMITTERS: Record<
  string,
  (node: INode, ctx: IRustStatementContext, compile: TCompileChildren) => string
> = {
  if: emitIf,
  switch: emitSwitch,
  foreach: emitForeach,
  'from-to-cycle': emitFromToCycle,
  while: emitWhile,
  'pseudo-cycle': emitPseudoCycle,
};

const LEAF_EMITTERS: Record<string, (node: INode, ctx: IRustStatementContext) => string> = {
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

const BINDING_EMITTERS: Record<string, (node: INode, ctx: IRustStatementContext) => IReturnBindingResult> = {
  'call-function': emitCallFunction,
  'call-api': emitCallApi,
  'arr-pop': emitArrPop,
  'arr-shift': emitArrShift,
  'arr-slice': emitArrSlice,
};

/**
 * Compiles a (possibly nested) statement list to Rust — the Rust-target analogue of
 * `compile-go-statements.ts`'s `compileGoStatementList`. Same shape as the Go version, including no
 * `cycleInfo` pre-pass: Rust's real labeled `break`/`continue` (see `rust-statement-context.ts`) needs
 * no bookkeeping counters either, just `ctx.loopLabels`/`ctx.usedLabels`.
 */
export const compileRustStatementList = (nodes: readonly INode[], ctx: IRustStatementContext): string => {
  const compileOneStatementIn = (
    node: INode,
    statementCtx: IRustStatementContext,
  ): { code: string; nextCtx: IRustStatementContext } => {
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
        compileRustStatementList(childNodes, {
          ...statementCtx,
          scope: options?.scopeOverrides ? { ...statementCtx.scope, ...options.scopeOverrides } : statementCtx.scope,
          loopLabels: options?.loopLabels ?? statementCtx.loopLabels,
        });
      return { code: wrapMarker(node, controlFlowEmitter(node, statementCtx, compile)), nextCtx: statementCtx };
    }
    if (node.name === 'parallel') {
      // Not implemented for the Rust target, same posture as the cpp/Go targets — no cross-language-
      // portable concurrency primitive was ever designed for it (the old app's own Rust codegen never
      // implemented `parallel` either).
      throw new Error('parallel is not implemented for the Rust target');
    }
    throw new Error(`No Rust compiler emitter registered for node "${node.name}"`);
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
 * Compiles a function body's statement list to Rust — the Rust-target analogue of
 * `compile-go-statements.ts`'s `compileGoStatements`. `scope` should already include the function's
 * own parameters (see `compile-rust-function.ts`).
 */
export const compileRustStatements = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>>,
  params: IRustStatementContext['params'],
): string =>
  compileRustStatementList(nodes, { scope, loopLabels: [], usedLabels: new Set(), labelCounter: { value: 0 }, params });
