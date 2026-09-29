import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createDefaultDocumentStackRegistry } from '@falang/mcp-core';
import { createDocument, readDocument } from '@falang/desktop-project-fs';
import type { IToolContext } from './tool-context.js';
import { resultJson, withTempProject } from './test-helpers.js';
import { handleCreateDocument, handleDeleteDocument, handleMoveDocument, handleRenameDocument } from './handlers.js';

/**
 * `handleRenameDocument`/`handleMoveDocument`/`handleDeleteDocument`'s Arduino pinned-document guard
 * (see ADR 0032 (private), "Decision → 2", and
 * `handlers.ts`'s `findPinnedArduinoDocumentError`). Kept as its own file rather than folded into
 * `handlers.test.ts` (already at oxlint's 300-line `max-lines` cap) — one small, focused spec file
 * per cross-cutting rule, the same shape `test-helpers.ts` already keeps separate from the handlers
 * it's shared by.
 */

// None of the handlers under test here (rename/move/delete) ever touch `ctx.registry` — it only
// matters for tools that build/validate a tree (create_document, get_node_kinds, set_document), so a
// plain default registry (with no 'arduino' project type registered on it — that needs driver folders
// on disk, see `arduino-project-type.ts`) is enough.
const buildArduinoCtx = (projectDir: string): IToolContext => ({
  projectDir,
  projectType: 'arduino',
  registry: createDefaultDocumentStackRegistry(),
});

/** Writes a document straight through `project-fs`, bypassing `handleCreateDocument`'s registry
 * validation entirely — used to set up documents (like a root-level `setup`) that no registered
 * `NodesStack` needs to accept, since these tests only care about the pinned-document guard itself. */
const createRawDocument = async (
  projectDir: string,
  params: { name: string; folderId: string | null },
): Promise<string> => {
  const id = randomUUID();
  await createDocument(projectDir, {
    document: { id, name: params.name, type: 'function', root: { id: randomUUID(), name: 'function', children: [] } },
    folderId: params.folderId,
  });
  return id;
};

describe('Arduino pinned documents guard', () => {
  it('refuses to rename a root-level "setup" document', async () => {
    await withTempProject({ name: 'p', type: 'arduino' }, async (projectDir) => {
      const ctx = buildArduinoCtx(projectDir);
      const id = await createRawDocument(projectDir, { name: 'setup', folderId: null });

      const result = await handleRenameDocument(ctx, { documentId: id, name: 'not-setup' });
      expect(result.isError).toBe(true);
      const fetched = await readDocument(projectDir, id);
      expect(fetched.name).toBe('setup');
    });
  });

  it('refuses to move a root-level "loop" document out of the root', async () => {
    await withTempProject({ name: 'p', type: 'arduino' }, async (projectDir) => {
      const ctx = buildArduinoCtx(projectDir);
      const id = await createRawDocument(projectDir, { name: 'loop', folderId: null });

      const result = await handleMoveDocument(ctx, { documentId: id, folderId: 'somewhere' });
      expect(result.isError).toBe(true);
    });
  });

  it('refuses to delete a root-level "setup" document', async () => {
    await withTempProject({ name: 'p', type: 'arduino' }, async (projectDir) => {
      const ctx = buildArduinoCtx(projectDir);
      const id = await createRawDocument(projectDir, { name: 'setup', folderId: null });

      const result = await handleDeleteDocument(ctx, { documentId: id });
      expect(result.isError).toBe(true);
      await expect(readDocument(projectDir, id)).resolves.toMatchObject({ id });
    });
  });

  it('allows renaming/moving/deleting an ordinary (non-pinned) Arduino function document', async () => {
    await withTempProject({ name: 'p', type: 'arduino' }, async (projectDir) => {
      const ctx = buildArduinoCtx(projectDir);
      const id = await createRawDocument(projectDir, { name: 'blink', folderId: null });

      const renamed = await handleRenameDocument(ctx, { documentId: id, name: 'blink2' });
      expect(renamed.isError).toBeFalsy();
      const moved = await handleMoveDocument(ctx, { documentId: id, folderId: null });
      expect(moved.isError).toBeFalsy();
      const deleted = await handleDeleteDocument(ctx, { documentId: id });
      expect(deleted.isError).toBeFalsy();
    });
  });

  it('allows renaming "setup" once it has been moved into a subfolder (no longer pinned)', async () => {
    await withTempProject({ name: 'p', type: 'arduino' }, async (projectDir) => {
      const ctx = buildArduinoCtx(projectDir);
      const id = await createRawDocument(projectDir, { name: 'setup', folderId: 'some-folder' });

      const result = await handleRenameDocument(ctx, { documentId: id, name: 'renamedSetup' });
      expect(result.isError).toBeFalsy();
    });
  });

  it('does not apply the Arduino pinned-document rule to other project types', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx: IToolContext = { projectDir, projectType: 'logic', registry: createDefaultDocumentStackRegistry() };
      const created = resultJson(await handleCreateDocument(ctx, { name: 'setup', type: 'function' })) as {
        id: string;
      };

      const result = await handleRenameDocument(ctx, { documentId: created.id, name: 'renamed' });
      expect(result.isError).toBeFalsy();
    });
  });
});
