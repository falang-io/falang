import type { INode } from '@falang/dto';

/**
 * `@falang/workflow-integrations-files` action node builders — see ADR 0038 (private) §4 and that package's own `actions.ts` for the exact field names these mirror.
 * The `files` vendor is credential-free (`credentialFields: []`), so none of these carry an
 * `integration`/`credentialId` field. Split out from `workflow-e2e-fixtures.ts` to stay under this
 * repo's 300-line-per-file lint cap (see CLAUDE.md's "Conventions").
 */
interface IFilesDownloadFields {
  /** Raw template-string body — e.g. a plain URL literal. */
  readonly url: string;
  /** Raw expression code, optional — defaults to `undefined` at the call site when left blank. */
  readonly headers?: string;
  readonly name?: string;
  readonly ttlHours?: string;
  readonly resultVariable: string;
}

/** `files-download` node. */
export const buildFilesDownloadNode = (id: string, fields: IFilesDownloadFields): INode => ({
  id,
  name: 'files-download',
  data: {
    url: fields.url,
    headers: fields.headers ?? '',
    name: fields.name ?? '',
    ttlHours: fields.ttlHours ?? '',
    resultVariable: fields.resultVariable,
  },
});

interface IFilesFromTextFields {
  /** Raw expression code, `expectedType: string` — e.g. `'"hello"'`. */
  readonly text: string;
  readonly name?: string;
  readonly mime?: string;
  readonly ttlHours?: string;
  readonly resultVariable: string;
}

/** `files-from-text` node. */
export const buildFilesFromTextNode = (id: string, fields: IFilesFromTextFields): INode => ({
  id,
  name: 'files-from-text',
  data: {
    text: fields.text,
    name: fields.name ?? '',
    mime: fields.mime ?? '',
    ttlHours: fields.ttlHours ?? '',
    resultVariable: fields.resultVariable,
  },
});

interface IFilesReadTextFields {
  /** Raw expression code, `expectedType: File`. */
  readonly file: string;
  readonly maxBytes?: string;
  readonly resultVariable: string;
}

/** `files-read-text` node. */
export const buildFilesReadTextNode = (id: string, fields: IFilesReadTextFields): INode => ({
  id,
  name: 'files-read-text',
  data: { file: fields.file, maxBytes: fields.maxBytes ?? '', resultVariable: fields.resultVariable },
});

interface IFilesPublishFields {
  /** Raw expression code, `expectedType: File`. */
  readonly file: string;
  readonly resultVariable: string;
}

/** `files-publish` node. */
export const buildFilesPublishNode = (id: string, fields: IFilesPublishFields): INode => ({
  id,
  name: 'files-publish',
  data: { file: fields.file, resultVariable: fields.resultVariable },
});
