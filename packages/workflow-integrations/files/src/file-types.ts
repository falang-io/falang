import type { TVariableInfo } from '@falang/typescript-dto';
import type { IIntegrationStructType } from '@falang/workflow-integrations-common';
import { FILE_TYPE_ID } from './constants.js';

/**
 * A reference to a binary object living in the platform's own S3-compatible bucket — never the
 * bytes themselves (see ADR 0038 (private) §1). `id` is only
 * reachable through this project's internal/JWT-guarded routes; `publicUrl` is present only after
 * `files-publish` mints a separate, unguessable `public_token` (`files-unpublish` clears it again —
 * the file itself, and its `id`, are unaffected either way).
 */
export interface IFileRef {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly mime: string;
  readonly publicUrl?: string;
}

const anyNumber: TVariableInfo = { type: 'number', numberType: { type: 'any' } };

/**
 * Registered into the editor's `TypesRegistryStore` via `IWorkflowIntegration.types` (see
 * `@falang/workflow-scheme`'s `IntegrationsModule`), the same way Telegram's own struct types are —
 * so any expression field typed `expectedType: fileTypeInfo()` resolves/autocompletes against it.
 * Other vendors (Telegram media, OpenAI attachments/`call-ai-image`) reference this same id rather
 * than declaring their own copy.
 */
export const filesFileType: IIntegrationStructType = {
  id: FILE_TYPE_ID,
  name: 'File',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    size: anyNumber,
    mime: { type: 'string' },
    publicUrl: { type: 'string', optional: true },
  },
};

/** `{ type: 'struct', id: 'files/File' }` — the `expectedType`/`resultType` every file-typed field or result uses. */
export const fileTypeInfo = (): TVariableInfo => ({ type: 'struct', id: FILE_TYPE_ID });

/** A `File[]` — e.g. OpenAI's `attachments` field (ADR 0038 (private) §6). */
export const fileArrayTypeInfo = (): TVariableInfo => ({ type: 'array', elementType: fileTypeInfo(), dimensions: 1 });
