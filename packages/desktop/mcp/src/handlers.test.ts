// oxlint-disable max-lines -- crossed 300 lines with new function-name-validation regression tests
// for create_document/rename_document; not accumulated complexity worth splitting the file over.
import { describe, expect, it } from 'vitest';
import { createDefaultDocumentStackRegistry, DEFAULT_LOCK_TTL_MS } from '@falang/mcp-core';
import { readDocument, readLocks, writeLocks } from '@falang/desktop-project-fs';
import type { IToolContext } from './tool-context.js';
import { MCP_LOCK_OWNER } from './owner.js';
import { resultJson, withTempProject } from './test-helpers.js';
import {
  handleCreateDocument,
  handleCreateFolder,
  handleDeleteDocument,
  handleGetDocument,
  handleGetNodeKinds,
  handleGetProject,
  handleListDocuments,
  handleLockDocument,
  handleMoveDocument,
  handleRenameDocument,
  handleSetDocument,
  handleUnlockDocument,
} from './handlers.js';

const buildLogicCtx = (projectDir: string): IToolContext => ({
  projectDir,
  projectType: 'logic',
  registry: createDefaultDocumentStackRegistry(),
});

const writeLocksFor = async (projectDir: string, documentId: string, owner: string): Promise<void> => {
  const now = Date.now();
  await writeLocks(projectDir, [
    {
      acquiredAt: new Date(now).toISOString(),
      documentId,
      expiresAt: new Date(now + DEFAULT_LOCK_TTL_MS).toISOString(),
      owner,
    },
  ]);
};

describe('handleGetProject', () => {
  it('returns the manifest plus the document types the project type allows', async () => {
    await withTempProject({ name: 'My Project', type: 'logic' }, async (projectDir) => {
      const result = await handleGetProject(buildLogicCtx(projectDir));
      const json = resultJson(result) as { name: string; type: string; documentTypes: string[] };
      expect(json.name).toBe('My Project');
      expect(json.type).toBe('logic');
      expect(json.documentTypes).toContain('function');
    });
  });
});

describe('handleCreateDocument / handleGetDocument / handleListDocuments', () => {
  it('creates a document with the default root when none is given, then reads it back', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = await handleCreateDocument(ctx, { name: 'main', type: 'function' });
      expect(created.isError).toBeFalsy();
      const doc = resultJson(created) as { id: string; name: string; type: string };
      expect(doc.name).toBe('main');

      const fetched = resultJson(await handleGetDocument(ctx, { documentId: doc.id })) as { root: { name: string } };
      expect(fetched.root.name).toBe('function');

      const listed = resultJson(await handleListDocuments(ctx)) as {
        documents: { id: string; name: string }[];
        folders: unknown[];
      };
      expect(listed.documents.map((d) => d.id)).toContain(doc.id);
      expect(listed.folders).toEqual([]);
    });
  });

  it('rejects an unknown document type without creating anything', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const result = await handleCreateDocument(ctx, { name: 'x', type: 'not-a-real-type' });
      expect(result.isError).toBe(true);
      const listed = resultJson(await handleListDocuments(ctx)) as { documents: unknown[] };
      expect(listed.documents).toEqual([]);
    });
  });

  // Guards the exact class of bug a real agent chat once hit: an LLM-driven `create_document` call
  // with a non-English/non-camelCase name, which `@falang/logic-constructor` would otherwise compile
  // verbatim into an invalid C++/TS identifier. Enforced in `@falang/desktop-project-fs`'s
  // `createDocument` (this handler's own `createDocument(...)` call below), not here — see that
  // package's `documents.ts`.
  it('rejects a "function" document name that is not a camelCase English identifier, without creating anything', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const result = await handleCreateDocument(ctx, { name: 'Мой бот', type: 'function' });
      expect(result.isError).toBe(true);
      const listed = resultJson(await handleListDocuments(ctx)) as { documents: unknown[] };
      expect(listed.documents).toEqual([]);
    });
  });

  it('accepts an explicit, valid root', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const defaultRoot = ctx.registry.getDefaultRoot('logic', 'function');
      const created = await handleCreateDocument(ctx, { name: 'f', type: 'function', root: defaultRoot });
      expect(created.isError).toBeFalsy();
    });
  });

  it('get_document on a missing id returns a tool error', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const result = await handleGetDocument(buildLogicCtx(projectDir), { documentId: 'nope' });
      expect(result.isError).toBe(true);
    });
  });
});

describe('handleGetNodeKinds', () => {
  it('returns the whole catalog when parentName is omitted', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const result = await handleGetNodeKinds(buildLogicCtx(projectDir), { documentType: 'function' });
      const catalog = (resultJson(result) as { nodeKinds: { name: string }[] }).nodeKinds;
      expect(catalog.some((entry) => entry.name === 'if')).toBe(true);
      expect(catalog.some((entry) => entry.name === 'create-var')).toBe(true);
    });
  });

  it("narrows to one kind's allowed children when parentName is given", async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const whole = (
        resultJson(await handleGetNodeKinds(buildLogicCtx(projectDir), { documentType: 'function' })) as {
          nodeKinds: { name: string }[];
        }
      ).nodeKinds;
      const result = await handleGetNodeKinds(buildLogicCtx(projectDir), {
        documentType: 'function',
        parentName: 'function-body',
      });
      const catalog = (resultJson(result) as { nodeKinds: { name: string }[] }).nodeKinds;
      // `function-body` (`children: true`) allows any *statement* node in the stack — not `function`
      // itself, which is `documentRootOnly` (may only ever be a document's own root), and not the
      // structural kinds other kinds name as their own slots/options (`function-body`, `if-child`,
      // `switch-option`, … — see `@falang/mcp-core`'s `getAllowedChildNames`). Narrowing is more
      // dramatic for a fixed-child-list kind like `switch`, asserted below.
      const names = catalog.map((entry) => entry.name);
      expect(catalog.length).toBeLessThan(whole.length);
      for (const excluded of ['function', 'function-body', 'function-header', 'if-child', 'switch-option']) {
        expect(names).not.toContain(excluded);
      }
      expect(names).toEqual(expect.arrayContaining(['action', 'if', 'switch', 'while']));

      const switchChildren = (
        resultJson(
          await handleGetNodeKinds(buildLogicCtx(projectDir), { documentType: 'function', parentName: 'switch' }),
        ) as { nodeKinds: { name: string }[] }
      ).nodeKinds;
      expect(switchChildren).toEqual([expect.objectContaining({ name: 'switch-option' })]);
      expect(switchChildren.length).toBeLessThan(whole.length);
    });
  });

  it('errors on an unknown document type', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const result = await handleGetNodeKinds(buildLogicCtx(projectDir), { documentType: 'nope' });
      expect(result.isError).toBe(true);
    });
  });
});

describe('handleSetDocument', () => {
  it('validates, auto-acquires the lock, writes the file, and preserves meta', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as {
        id: string;
        root: { children: { name: string; meta?: unknown }[] };
      };

      const newRoot = structuredClone(created.root);
      const set = await handleSetDocument(ctx, { documentId: created.id, root: newRoot });
      expect(set.isError).toBeFalsy();

      const onDisk = await readDocument(projectDir, created.id);
      expect(onDisk.root?.children?.[0]?.name).toBe('function-header');

      const locks = await readLocks(projectDir);
      expect(locks).toHaveLength(1);
      expect(locks[0]?.owner).toBe(MCP_LOCK_OWNER);
      expect(locks[0]?.documentId).toBe(created.id);
    });
  });

  it('rejects an invalid tree and names the zod path, without touching the document', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as { id: string };
      const before = await readDocument(projectDir, created.id);

      const badRoot = { id: 'bad', name: 'not-a-real-node-kind' };
      const result = await handleSetDocument(ctx, { documentId: created.id, root: badRoot });
      expect(result.isError).toBe(true);
      const message = (result.content[0] as { text: string }).text;
      expect(message).toContain('set_document');

      const after = await readDocument(projectDir, created.id);
      expect(after).toEqual(before);
    });
  });

  it('rejects a write while the document is locked by another session', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as {
        id: string;
        root: unknown;
      };
      await writeLocksFor(projectDir, created.id, 'someone-else');

      const result = await handleSetDocument(ctx, { documentId: created.id, root: created.root });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('locked by another session');
    });
  });
});

describe('handleRenameDocument / handleMoveDocument / handleCreateFolder', () => {
  it('renames, moves into a created folder, and lists the folder', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as { id: string };
      const folder = resultJson(await handleCreateFolder(ctx, { name: 'stuff' })) as { id: string };

      const renamed = await handleRenameDocument(ctx, { documentId: created.id, name: 'renamed' });
      expect(renamed.isError).toBeFalsy();
      const moved = await handleMoveDocument(ctx, { documentId: created.id, folderId: folder.id });
      expect(moved.isError).toBeFalsy();

      const listed = resultJson(await handleListDocuments(ctx)) as {
        documents: { id: string; name: string; folderId: string | null }[];
        folders: { id: string; name: string }[];
      };
      const entry = listed.documents.find((doc) => doc.id === created.id);
      expect(entry?.name).toBe('renamed');
      expect(entry?.folderId).toBe(folder.id);
      expect(listed.folders.map((f) => f.name)).toContain('stuff');
    });
  });

  it('rejects renaming a "function" document to a name that is not a camelCase English identifier', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as { id: string };

      const result = await handleRenameDocument(ctx, { documentId: created.id, name: 'Мой бот' });
      expect(result.isError).toBe(true);

      const listed = resultJson(await handleListDocuments(ctx)) as { documents: { id: string; name: string }[] };
      expect(listed.documents.find((doc) => doc.id === created.id)?.name).toBe('f');
    });
  });
});

describe('handleDeleteDocument', () => {
  it('deletes an unlocked document', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as { id: string };
      const result = await handleDeleteDocument(ctx, { documentId: created.id });
      expect(result.isError).toBeFalsy();
      const gone = await handleGetDocument(ctx, { documentId: created.id });
      expect(gone.isError).toBe(true);
    });
  });

  it('refuses to delete a document locked by another session', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as { id: string };
      await writeLocksFor(projectDir, created.id, 'someone-else');

      const result = await handleDeleteDocument(ctx, { documentId: created.id });
      expect(result.isError).toBe(true);
      const stillThere = await handleGetDocument(ctx, { documentId: created.id });
      expect(stillThere.isError).toBeFalsy();
    });
  });

  it('deletes and clears its own lock', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as { id: string };
      await handleLockDocument(ctx, { documentId: created.id });
      const result = await handleDeleteDocument(ctx, { documentId: created.id });
      expect(result.isError).toBeFalsy();
      const locks = await readLocks(projectDir);
      expect(locks).toEqual([]);
    });
  });
});

describe('handleLockDocument / handleUnlockDocument', () => {
  it('acquires then releases a lock', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as { id: string };

      const locked = await handleLockDocument(ctx, { documentId: created.id });
      expect(locked.isError).toBeFalsy();
      let locks = await readLocks(projectDir);
      expect(locks[0]?.owner).toBe(MCP_LOCK_OWNER);

      const unlocked = await handleUnlockDocument(ctx, { documentId: created.id });
      expect(unlocked.isError).toBeFalsy();
      locks = await readLocks(projectDir);
      expect(locks).toEqual([]);
    });
  });

  it('fails to lock a document already locked by another session', async () => {
    await withTempProject({ name: 'p', type: 'logic' }, async (projectDir) => {
      const ctx = buildLogicCtx(projectDir);
      const created = resultJson(await handleCreateDocument(ctx, { name: 'f', type: 'function' })) as { id: string };
      await writeLocksFor(projectDir, created.id, 'someone-else');

      const result = await handleLockDocument(ctx, { documentId: created.id });
      expect(result.isError).toBe(true);
    });
  });
});
