import { promises as fs } from 'node:fs';
import * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import git from 'isomorphic-git';
import type { IProjectDocument } from '@falang/dto';
import type { IGitVersioningOptions } from './git-version-store-types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument, deleteDocument, readDocument, writeDocument } from '../documents.js';
import { documentPath } from '../paths.js';
import { createProject } from '../project.js';
import { createGitVersionStore } from './git-version-store.js';

const doc = (id: string, value: string): IProjectDocument => ({
  id,
  type: 'contour',
  name: id,
  root: { id: `${id}-root`, name: 'contour', data: { value } },
});

const makeOptions = (overrides: Partial<IGitVersioningOptions> = {}): IGitVersioningOptions => ({
  repoMode: 'private',
  author: { name: 'Test Author', email: 'test@example.com' },
  ...overrides,
});

describe('GitVersionStore', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-git-test-'));
    await createProject(projectDir, { name: 'My Project', type: 'text' });
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('has empty history before the first commit, and getWorkingCopy works regardless', async () => {
    const store = createGitVersionStore(projectDir, () => makeOptions());

    await expect(store.listCommits()).resolves.toEqual([]);
    await expect(fs.access(path.join(projectDir, '.git'))).rejects.toThrow();

    const workingCopy = await store.getWorkingCopy();
    expect(workingCopy).toEqual({ folders: [], documents: [] });
  });

  it('creates .git and .gitignore on the first commit, auto-kind by default', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const info = await store.commit({ kind: 'auto', message: 'Auto-save 2026-09-17 14:00' });

    expect(info).not.toBeNull();
    expect(info?.kind).toBe('auto');
    expect(info?.parentId).toBeNull();
    expect(info?.author).toBe('Test Author <test@example.com>');

    const gitStat = await fs.stat(path.join(projectDir, '.git'));
    expect(gitStat.isDirectory()).toBe(true);

    const gitignore = await fs.readFile(path.join(projectDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('generated/');
    expect(gitignore).toContain('.falang-debug.json');
    expect(gitignore).toContain('backup/');
  });

  it('returns null from a second commit with no tree changes', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const first = await store.commit({ kind: 'auto', message: 'first' });
    expect(first).not.toBeNull();

    const second = await store.commit({ kind: 'auto', message: 'second' });
    expect(second).toBeNull();

    await expect(store.listCommits()).resolves.toHaveLength(1);
  });

  it('a document edit produces a new commit, and getSnapshot round-trips both roots', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const c1 = await store.commit({ kind: 'named', message: 'v1' });
    expect(c1).not.toBeNull();

    await writeDocument(projectDir, doc('doc-1', 'v2'));
    const c2 = await store.commit({ kind: 'named', message: 'v2' });
    expect(c2).not.toBeNull();
    expect(c2?.parentId).toBe(c1?.id);

    const snapshotAtC1 = await store.getSnapshot((c1 as { id: string }).id);
    expect(snapshotAtC1.documents[0]?.root).toEqual(doc('doc-1', 'v1').root);

    const snapshotAtC2 = await store.getSnapshot((c2 as { id: string }).id);
    expect(snapshotAtC2.documents[0]?.root).toEqual(doc('doc-1', 'v2').root);
  });

  it('a named commit reports kind "named" with its message; nameCommit renames/promotes', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const c1 = await store.commit({ kind: 'named', message: 'Checkpoint A' });
    expect(c1).toMatchObject({ kind: 'named', message: 'Checkpoint A' });

    await writeDocument(projectDir, doc('doc-1', 'v2'));
    const c2 = await store.commit({ kind: 'auto', message: 'Auto-save' });
    expect(c2).toMatchObject({ kind: 'auto', message: 'Auto-save' });

    const promoted = await store.nameCommit((c2 as { id: string }).id, 'Checkpoint B');
    expect(promoted).toMatchObject({ kind: 'named', message: 'Checkpoint B' });

    const renamed = await store.nameCommit((c1 as { id: string }).id, 'Renamed A');
    expect(renamed).toMatchObject({ kind: 'named', message: 'Renamed A' });

    const list = await store.listCommits();
    expect(list.find((entry) => entry.id === (c1 as { id: string }).id)).toMatchObject({ message: 'Renamed A' });
    expect(list.find((entry) => entry.id === (c2 as { id: string }).id)).toMatchObject({ message: 'Checkpoint B' });
  });

  it('deleting a document then committing, then restoring an earlier commit, recreates the file', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    await createDocument(projectDir, { document: doc('doc-2', 'kept'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const c1 = await store.commit({ kind: 'named', message: 'both docs' });
    expect(c1).not.toBeNull();

    await deleteDocument(projectDir, 'doc-2');
    const c2 = await store.commit({ kind: 'named', message: 'removed doc-2' });
    expect(c2).not.toBeNull();
    await expect(fs.access(documentPath(projectDir, 'doc-2'))).rejects.toThrow();

    const restored = await store.restore((c1 as { id: string }).id);
    expect(restored.kind).toBe('named');
    expect(restored.message).toMatch(/^Restore [0-9a-f]{7}: both docs$/);

    const restoredDoc = await readDocument(projectDir, 'doc-2');
    expect(restoredDoc).toEqual(doc('doc-2', 'kept'));

    const list = await store.listCommits();
    expect(list[0]?.id).toBe(restored.id);
    expect(list).toHaveLength(3);
  });

  it('a document created after a commit is deleted by restoring that commit', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const c1 = await store.commit({ kind: 'named', message: 'one doc' });
    expect(c1).not.toBeNull();

    await createDocument(projectDir, { document: doc('doc-2', 'new'), folderId: null });
    const c2 = await store.commit({ kind: 'named', message: 'added doc-2' });
    expect(c2).not.toBeNull();

    await store.restore((c1 as { id: string }).id);

    await expect(fs.access(documentPath(projectDir, 'doc-2'))).rejects.toThrow();
    const workingCopy = await store.getWorkingCopy();
    expect(workingCopy.documents.map((d) => d.id)).toEqual(['doc-1']);
  });

  it('lists commits newest-first with correct parentIds', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const c1 = await store.commit({ kind: 'named', message: 'c1' });
    await writeDocument(projectDir, doc('doc-1', 'v2'));
    const c2 = await store.commit({ kind: 'named', message: 'c2' });
    await writeDocument(projectDir, doc('doc-1', 'v3'));
    const c3 = await store.commit({ kind: 'named', message: 'c3' });

    const list = await store.listCommits();
    expect(list.map((entry) => entry.id)).toEqual([
      (c3 as { id: string }).id,
      (c2 as { id: string }).id,
      (c1 as { id: string }).id,
    ]);
    expect(list[0]?.parentId).toBe((c2 as { id: string }).id);
    expect(list[1]?.parentId).toBe((c1 as { id: string }).id);
    expect(list[2]?.parentId).toBeNull();
  });

  it('returns null for a key-order-only rewrite of a document file', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());
    await store.commit({ kind: 'named', message: 'c1' });

    const original = doc('doc-1', 'v1');
    const reordered = { name: original.name, root: original.root, id: original.id, type: original.type };
    await fs.writeFile(documentPath(projectDir, 'doc-1'), JSON.stringify(reordered, null, 2));

    const result = await store.commit({ kind: 'auto', message: 'no-op' });
    expect(result).toBeNull();
  });

  it('concurrent commit() calls serialize without corrupting history', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());

    const [first, second] = await Promise.all([
      store.commit({ kind: 'auto', message: 'first' }),
      store.commit({ kind: 'auto', message: 'second' }),
    ]);

    // Both fired against the same starting working copy; the queue serializes them, so only the
    // one that runs first actually sees a dirty tree — the other finds nothing new to commit.
    const results = [first, second];
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    await expect(store.listCommits()).resolves.toHaveLength(1);
  });

  describe('repoMode: enclosing', () => {
    // oxlint-disable-next-line init-declarations
    let outerDir: string;

    beforeEach(async () => {
      outerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-outer-repo-'));
      await git.init({ fs: nodeFs, dir: outerDir, defaultBranch: 'main' });
      await fs.writeFile(path.join(outerDir, 'README.md'), '# outer repo');
      await git.add({ fs: nodeFs, dir: outerDir, filepath: 'README.md' });
      await git.commit({
        fs: nodeFs,
        dir: outerDir,
        message: 'outer unrelated commit',
        author: { name: 'Outer', email: 'outer@example.com' },
      });
    });

    afterEach(async () => {
      await fs.rm(outerDir, { recursive: true, force: true });
    });

    it('reuses the enclosing repo, scoping history and never creating a nested .git', async () => {
      const nestedProjectDir = path.join(outerDir, 'projects', 'my-project');
      await fs.mkdir(nestedProjectDir, { recursive: true });
      await createProject(nestedProjectDir, { name: 'Nested', type: 'text' });
      await createDocument(nestedProjectDir, { document: doc('doc-1', 'v1'), folderId: null });

      const store = createGitVersionStore(nestedProjectDir, () => makeOptions({ repoMode: 'enclosing' }));
      const info = await store.commit({ kind: 'named', message: 'nested commit' });
      expect(info).not.toBeNull();

      await expect(fs.access(path.join(nestedProjectDir, '.git'))).rejects.toThrow();
      await expect(fs.access(path.join(outerDir, '.git'))).resolves.toBeUndefined();

      const outerLog = await git.log({ fs: nodeFs, dir: outerDir });
      expect(outerLog.map((entry) => entry.commit.message.trim())).toContain('nested commit');

      // Scoped to the project's own paths — the outer repo's unrelated commit is excluded.
      const list = await store.listCommits();
      expect(list).toHaveLength(1);
      expect(list[0]?.message).toBe('nested commit');
    });
  });

  describe('repoMode: private inside an outer repo', () => {
    it('creates a nested .git (documented footgun) rather than reusing the outer repo', async () => {
      const outerDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-outer-for-private-'));
      try {
        await git.init({ fs: nodeFs, dir: outerDir, defaultBranch: 'main' });

        const nestedProjectDir = path.join(outerDir, 'my-project');
        await fs.mkdir(nestedProjectDir, { recursive: true });
        await createProject(nestedProjectDir, { name: 'Nested', type: 'text' });
        await createDocument(nestedProjectDir, { document: doc('doc-1', 'v1'), folderId: null });

        const store = createGitVersionStore(nestedProjectDir, () => makeOptions({ repoMode: 'private' }));
        await store.commit({ kind: 'named', message: 'private nested commit' });

        await expect(fs.access(path.join(nestedProjectDir, '.git'))).resolves.toBeUndefined();
      } finally {
        await fs.rm(outerDir, { recursive: true, force: true });
      }
    });
  });
});
