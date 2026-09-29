/**
 * Thrown by a node emitter (see `node-emitters.ts`'s per-node dispatch) when it can attribute a
 * failure to one specific node, rather than the document as a whole — lets the editor jump straight
 * to the offending node instead of just opening the document. `compile-project.ts`'s per-document
 * catch unwraps `nodeId` from this onto `ICompileError` (see `compile-errors.ts`); any other thrown
 * `Error` still compiles fine into an `ICompileError`, just without a `nodeId`.
 */
export class NodeCompileError extends Error {
  readonly nodeId: string;

  constructor(nodeId: string, message: string) {
    super(message);
    this.name = 'NodeCompileError';
    this.nodeId = nodeId;
  }
}
