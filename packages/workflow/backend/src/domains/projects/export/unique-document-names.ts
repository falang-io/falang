import { FUNCTION_LIKE_DOCUMENT_TYPES } from '@falang/dto';

/**
 * Document names are unique per project, case-insensitively (`DocumentsService.assertUniqueName`).
 * An imported payload may still contain duplicates — an older export, or a project restored from a
 * snapshot that predates the rule — so import renames the later ones instead of failing: a function-like
 * document gets a numeric suffix (`run` → `run2`, still a valid identifier), any other `Name (2)`.
 * `reserved` are names the new project already holds (the seeded `Integrations` document).
 */
export const dedupeDocumentNames = <T extends { type: string; name: string }>(
  documents: readonly T[],
  reserved: readonly string[],
): T[] => {
  const used = new Set(reserved.map((name) => name.trim().toLowerCase()));
  return documents.map((document) => {
    let name = document.name;
    let counter = 2;
    while (used.has(name.trim().toLowerCase())) {
      name = FUNCTION_LIKE_DOCUMENT_TYPES.has(document.type)
        ? `${document.name}${counter}`
        : `${document.name} (${counter})`;
      counter += 1;
    }
    used.add(name.trim().toLowerCase());
    return name === document.name ? document : { ...document, name };
  });
};
