export interface IApiCompileError {
  readonly documentId: string;
  readonly documentName: string;
  /** The specific node the failure is attributable to, if any — lets the editor jump straight to it instead of just opening the document. Absent for document-level failures. */
  readonly nodeId?: string;
  readonly message: string;
}

export interface IApiCompileErrorFile {
  readonly path: string;
  readonly content: string;
}

/** Thrown by `request()` (see `api-client.ts`) when the backend rejects a build/publish/code-generation call with a structured list of per-document compile errors — see `BuildService`'s `compileProjectDocuments`. Kept distinct from a plain `Error` so callers can render the list (and, via `files`, the compiled-or-partially-compiled code alongside it) instead of one flattened message. */
export class ApiCompileErrorsError extends Error {
  readonly errors: readonly IApiCompileError[];
  readonly files: readonly IApiCompileErrorFile[];

  constructor(errors: readonly IApiCompileError[], files: readonly IApiCompileErrorFile[] = []) {
    super('Project failed to compile');
    this.errors = errors;
    this.files = files;
  }
}
