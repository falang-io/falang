import type { IProjectDocument } from '@falang/dto';
import {
  buildConstantsModuleCode,
  CONSTANTS_DOCUMENT_TYPE,
  normalizeConstantsDocumentData,
  type TConstantEnv,
} from '@falang/workflow-dto';
import type { ICompileError } from './compile-errors.js';

export interface IProjectConstantsBlock {
  /** The module-level `const` declarations, wrapped in the constants document's markers; `''` without constants. */
  readonly code: string;
  /** One entry when the stored constants are malformed (the backend validates on save, so normally none). */
  readonly errors: readonly ICompileError[];
}

/**
 * The project's constants (the pinned `constants` document) for `env`, as module-level `const`s placed before every
 * compiled function, so each one is visible by name everywhere — the same names the editors declare ambiently. The
 * values are fixed at build time: a dev build gets the dev values, a published version the prod ones.
 */
export const buildProjectConstantsBlock = (
  documents: readonly IProjectDocument[],
  env: TConstantEnv,
): IProjectConstantsBlock => {
  const document = documents.find((candidate) => candidate.type === CONSTANTS_DOCUMENT_TYPE);
  if (!document) return { code: '', errors: [] };
  const normalized = normalizeConstantsDocumentData(document.data ?? null);
  if (!normalized.ok) {
    return {
      code: '',
      errors: [{ documentId: document.id, documentName: document.name, message: normalized.errors.join('; ') }],
    };
  }
  if (normalized.data.constants.length === 0) return { code: '', errors: [] };
  const marker = `${document.name}:${document.id}`;
  return {
    code: `// doc-start:${marker}\n${buildConstantsModuleCode(normalized.data.constants, env)}\n// doc-end:${marker}\n\n`,
    errors: [],
  };
};
