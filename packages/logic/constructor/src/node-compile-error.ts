/**
 * Thrown by a statement emitter (see `compile-cpp-statements.ts`) when it can attribute a failure to
 * one specific node, so a caller can point the user at the offending node instead of just the
 * document. Same shape as `@falang/workflow-compiler`'s own `NodeCompileError` — duplicated rather
 * than imported, since `packages/logic/*` deliberately doesn't depend on `packages/workflow/*` (see
 * ADR 0002 (private)).
 */
export class NodeCompileError extends Error {
  readonly nodeId: string;

  constructor(nodeId: string, message: string) {
    super(message);
    this.name = 'NodeCompileError';
    this.nodeId = nodeId;
  }
}
