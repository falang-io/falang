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
} from './sharp-leaf-emitters.js';
import {
  emitForeach,
  emitFromToCycle,
  emitIf,
  emitPseudoCycle,
  emitSwitch,
  emitWhile,
} from './sharp-control-flow-emitters.js';
import {
  withScope,
  wrapMarker,
  type ISharpStatementContext,
  type TCompileChildren,
} from './sharp-statement-context.js';

export type {
  ISharpCompileParams,
  ISharpFunctionSignature,
  ISharpStatementContext,
} from './sharp-statement-context.js';

interface IReturnBindingResult {
  readonly code: string;
  readonly returnBinding?: { readonly name: string; readonly type: TVariableInfo };
}

const withOptionalBinding = (ctx: ISharpStatementContext, result: IReturnBindingResult): ISharpStatementContext =>
  result.returnBinding ? withScope(ctx, result.returnBinding.name, result.returnBinding.type) : ctx;

const CONTROL_FLOW_EMITTERS: Record<
  string,
  (node: INode, ctx: ISharpStatementContext, compile: TCompileChildren) => string
> = {
  if: emitIf,
  switch: emitSwitch,
  foreach: emitForeach,
  'from-to-cycle': emitFromToCycle,
  while: emitWhile,
  'pseudo-cycle': emitPseudoCycle,
};

const LEAF_EMITTERS: Record<string, (node: INode, ctx: ISharpStatementContext) => string> = {
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

const BINDING_EMITTERS: Record<string, (node: INode, ctx: ISharpStatementContext) => IReturnBindingResult> = {
  'call-function': emitCallFunction,
  'call-api': emitCallApi,
  'arr-pop': emitArrPop,
  'arr-shift': emitArrShift,
  'arr-slice': emitArrSlice,
};

/** Compiles a (possibly nested) statement list to C#, folding `scope` across sibling statements — same shape as `compile-cpp-statements.ts`'s `compileStatementList` (see its doc comment). */
export const compileSharpStatementList = (nodes: readonly INode[], ctx: ISharpStatementContext): string => {
  const compileOneStatementIn = (
    node: INode,
    statementCtx: ISharpStatementContext,
  ): { code: string; nextCtx: ISharpStatementContext } => {
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
        compileSharpStatementList(childNodes, {
          ...statementCtx,
          scope: options?.scopeOverrides ? { ...statementCtx.scope, ...options.scopeOverrides } : statementCtx.scope,
          nesting: options?.nesting ?? statementCtx.nesting,
        });
      return { code: wrapMarker(node, controlFlowEmitter(node, statementCtx, compile)), nextCtx: statementCtx };
    }
    if (node.name === 'parallel') {
      // Same as every other statement-level target here — the old app's own C# builder threw an
      // identical "Parallel not implemented" too.
      throw new Error('parallel is not implemented for the C# target');
    }
    throw new Error(`No C# compiler emitter registered for node "${node.name}"`);
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

/** Compiles a function body's statement list to C# — the C#-target analogue of `compileCppStatements`. `scope` should already include the function's own parameters (see `compile-sharp-function.ts`). */
export const compileSharpStatements = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>>,
  params: ISharpStatementContext['params'],
  returnValue?: TVariableInfo,
): string => {
  const cycleInfo = computeCycleInfo(nodes);
  return compileSharpStatementList(nodes, { scope, nesting: [], cycleInfo, returnValue, params });
};
