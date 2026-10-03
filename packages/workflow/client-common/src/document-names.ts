import { FUNCTION_LIKE_DOCUMENT_TYPES, isValidFunctionName } from '@falang/dto';

/** The name as compared for uniqueness: documents of one project may not differ only by case or surrounding spaces. */
export const normalizeDocumentName = (name: string): string => name.trim().toLowerCase();

/**
 * The document that already holds `name` (case-insensitively, any type) in the project, or `undefined`.
 * `exceptId` is the document being renamed. Mirrors the backend's `DocumentsService.assertUniqueName`,
 * which stays authoritative — this is the early, friendly check for forms and agent tools.
 */
export const findDocumentNameConflict = <T extends { id: string; name: string }>(
  documents: readonly T[],
  name: string,
  exceptId: string | null = null,
): T | undefined => {
  const wanted = normalizeDocumentName(name);
  return documents.find((document) => document.id !== exceptId && normalizeDocumentName(document.name) === wanted);
};

export type TDocumentNameError = 'required' | 'invalid-function-name' | 'taken';

/**
 * Why `name` cannot be given to a (new or renamed) document of `type`, or `null` when it can: empty,
 * not an English camelCase identifier for the function-like types the compiler splices verbatim into
 * code, or already used by another document of the project. `exceptId` is the document being renamed.
 */
export const validateDocumentName = (
  documents: readonly { id: string; name: string }[],
  type: string,
  name: string,
  exceptId: string | null = null,
): TDocumentNameError | null => {
  if (!name.trim()) return 'required';
  if (FUNCTION_LIKE_DOCUMENT_TYPES.has(type) && !isValidFunctionName(name.trim())) return 'invalid-function-name';
  if (findDocumentNameConflict(documents, name, exceptId)) return 'taken';
  return null;
};
