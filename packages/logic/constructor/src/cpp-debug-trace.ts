import type { INode } from '@falang/dto';
import { variableInfoToCppType } from './cpp-type-name.js';
import type { ICppStatementContext } from './cpp-statement-context.js';

/**
 * Prepends a trace call to one statement's own compiled `code`, if `ctx.debug` opted in — the cpp
 * analogue of `@falang/workflow-compiler`'s `emitDebugTrace`. Snapshots `ctx.scope` (variables visible
 * *before* this node's own contribution, e.g. a `create-var`'s own `let x` hasn't run yet) so a node's
 * trace point never sees a variable it itself declares. `Object.entries` preserves the scope's
 * insertion order (guaranteed for string keys) — the same order the Monaco scope walker and the
 * workflow compiler's own ordered `IScopeVariable[]` would show at this point.
 */
export const applyCppDebugTrace = (node: INode, code: string, ctx: ICppStatementContext): string => {
  if (!ctx.debug || code === '') return code;
  const index = ctx.debug.allocateIndex();
  const tracedScope = ctx.debug.tracer.selectVariables ? ctx.debug.tracer.selectVariables(ctx.scope) : ctx.scope;
  const variables = Object.entries(tracedScope).map(([name, type]) => ({
    name,
    type: variableInfoToCppType(type, ctx.params.structNames),
  }));
  ctx.debug.onTracePoint({ index, documentId: ctx.debug.documentId, nodeId: node.id, variables });
  const traceLine = ctx.debug.tracer.emitTrace(node, index, tracedScope);
  return traceLine === '' ? code : `${traceLine}\n${code}`;
};
