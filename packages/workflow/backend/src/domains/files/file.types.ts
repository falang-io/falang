/**
 * See ADR 0038 (private) §1/§2/§4 and the fixed phase-2 contract
 * (the private plan for ADRs 0037-0041). Deliberately not imported from
 * `@falang/workflow-integrations-files` (an independently-developed package this session must not
 * touch) — the contract fixes this shape precisely enough that both sides can implement it without
 * a shared import.
 */

/** What a runner activity gets back from the internal file API — never the bytes themselves. */
export interface IFileRef {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly publicUrl?: string;
}

/** The project-scoped Files tab's row shape — `GET`/`POST /projects/:projectId/files`. */
export interface IApiFile {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly publicUrl: string | null;
}

export interface IProjectFilesUsage {
  readonly usedBytes: number;
  readonly maxProjectFilesBytes: number;
  readonly maxFileBytes: number;
}

export interface IProjectFilesListResponse {
  readonly files: readonly IApiFile[];
  readonly usage: IProjectFilesUsage;
}

/** What a caller (the internal controller, the project controller) hands `FilesService.upload` alongside the raw byte stream. */
export interface IUploadFileMeta {
  readonly name: string;
  readonly mime: string;
  readonly ttlSeconds?: number;
  readonly createdBy: string;
  readonly workflowEnv?: 'dev' | 'prod';
}
