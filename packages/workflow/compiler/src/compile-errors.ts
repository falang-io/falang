/** One document's compile failure — `compile-project.ts` collects one of these per broken `function`/`trigger-function` document instead of aborting on the first. */
export interface ICompileError {
  readonly documentId: string;
  readonly documentName: string;
  /** The specific node the failure is attributable to, if any — see `NodeCompileError`. Absent for document-level failures (e.g. a function document with no root node at all). */
  readonly nodeId?: string;
  readonly message: string;
}

/**
 * Thrown by `compileProject` once every document has been attempted — carries every failure found,
 * not just the first. `workflows`/`activities` are the best-effort partial output assembled from
 * whatever documents DID compile successfully, so a caller (e.g. the editor's code viewer) can
 * still show the user their code alongside the errors, instead of showing nothing at all.
 */
export class ProjectCompileError extends Error {
  readonly errors: readonly ICompileError[];
  readonly workflows: string;
  readonly activities: string;

  constructor(errors: readonly ICompileError[], workflows: string, activities: string) {
    super(errors.map((error) => `${error.documentName}: ${error.message}`).join('\n'));
    this.name = 'ProjectCompileError';
    this.errors = errors;
    this.workflows = workflows;
    this.activities = activities;
  }
}
