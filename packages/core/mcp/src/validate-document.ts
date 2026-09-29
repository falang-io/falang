import type { IProjectDocument } from '@falang/dto';
import { zod } from '@falang/dto';
import type { DocumentStackRegistry } from './stack-registry.js';

export type TValidateDocumentResult =
  | { readonly ok: true; readonly document: IProjectDocument }
  | { readonly ok: false; readonly error: string };

const formatZodIssues = (issues: readonly { message: string; path: readonly PropertyKey[] }[]): string =>
  issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ');

/**
 * Validates `document` (its `type` picks the `NodesStack` from `registry`) via that stack's own
 * `NodesStack.parseDocument` — the same zod discriminated union `@falang/dto` builds for every
 * document type, so this cannot drift from what a real editor would accept. Returns zod's own parsed
 * `{ id, name, root }` merged back over `document` (so `type` and anything else the caller carried
 * survives) on success, or every issue as `path: message` lines on failure.
 *
 * Deliberately does NOT check `name`'s format (see `isValidFunctionName`/`FUNCTION_LIKE_DOCUMENT_TYPES`
 * in `@falang/dto`) — this is also reached by `applySetDocument`, which calls it with the *existing*,
 * unchanged `oldDocument.name` on every tree edit, not just on creation. Gating name format here would
 * retroactively block editing a document a pre-this-feature project already created with an invalid
 * name, rather than only stopping new invalid names from being created. Each host's own
 * `create_document`/`rename_document` tool handler checks the name explicitly instead, where "this is
 * a brand-new/renamed name" is unambiguous.
 */
export const validateDocument = (
  projectType: string,
  document: IProjectDocument,
  registry: DocumentStackRegistry,
): TValidateDocumentResult => {
  const stack = registry.getStack(projectType, document.type);
  if (!stack) {
    return { error: `Unknown document type "${document.type}" for project type "${projectType}"`, ok: false };
  }
  try {
    const parsed = stack.parseDocument(document);
    return { document: { ...document, ...parsed }, ok: true };
  } catch (error) {
    if (error instanceof zod.ZodError) {
      return { error: formatZodIssues(error.issues), ok: false };
    }
    throw error;
  }
};
