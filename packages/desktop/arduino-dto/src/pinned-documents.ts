import { DEVICES_DOCUMENT_TYPE } from './devices-document.js';

/**
 * The pinned-document rule for an Arduino project (see
 * ADR 0032 (private), "Decision → 2") — `setup`, `loop` and
 * the `Devices` document can't be deleted, renamed or moved, and the project tree shows no context
 * menu / drag handle for them. Pinned-ness is deliberately **derived**, not stored on the document
 * itself (no `pinned` flag persisted to disk) — the same shape as everything else this rule mirrors
 * (ADR 0006 (private)'s workflow-product `integrations` document), just computed here instead of
 * read from a field, so both `packages/desktop/app-arduino` (the renderer, via the
 * `src/shared/pinned-documents.ts` shim) and `@falang/desktop-mcp` (`handlers.ts`, guarding
 * `rename_document`/`move_document`/`delete_document`) share exactly one rule rather than keeping two
 * copies in sync.
 *
 * `setup`/`loop` are only pinned at the project **root** — a document merely named "setup" inside a
 * user-created subfolder isn't the one `compileArduinoProject` looks for, so it stays an ordinary,
 * deletable document (mirrors `main/ensure-project-documents.ts`'s `ensureArduinoProjectDocuments`,
 * which only ever creates `setup`/`loop` at the project root — see that function's own doc comment).
 */
export const REQUIRED_ROOT_DOCUMENT_NAMES = ['setup', 'loop'] as const;

export interface IPinnableDocument {
  readonly name: string;
  readonly type: string;
  readonly folderId: string | null;
}

export const isArduinoPinnedDocument = (doc: IPinnableDocument): boolean => {
  if (doc.type === DEVICES_DOCUMENT_TYPE) return true;
  return doc.folderId === null && (REQUIRED_ROOT_DOCUMENT_NAMES as readonly string[]).includes(doc.name);
};
