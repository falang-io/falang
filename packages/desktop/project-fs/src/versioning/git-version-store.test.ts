// oxlint-disable unicorn/no-await-expression-member, max-lines, unicorn/consistent-function-scoping, unicorn/no-array-sort, no-undefined, unicorn/escape-case, unicorn/prefer-string-raw
import { promises as fs } from 'node:fs';
import * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import git from 'isomorphic-git';
import type { IProjectDocument } from '@falang/dto';
import type { IGitVersioningOptions } from './git-version-store-types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument, deleteDocument, readDocument, renameDocument, writeDocument } from '../documents.js';
import { readManifest } from '../manifest.js';
import { configDir, documentsDir, driversDir, manifestPath } from '../paths.js';
import { createFolder, renameFolder } from '../folders.js';
import { createProject, openProject } from '../project.js';
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

  it('versions falang/drivers/ files and restore removes drivers deleted since', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const keep = path.join(driversDir(projectDir), 'keep');
    await fs.mkdir(keep, { recursive: true });
    await fs.writeFile(path.join(keep, 'driver.config.json'), '{"id":"keep"}');
    const store = createGitVersionStore(projectDir, () => makeOptions());
    const c1 = await store.commit({ kind: 'named', message: 'one driver' });
    expect(c1).not.toBeNull();

    const extra = path.join(driversDir(projectDir), 'extra');
    await fs.mkdir(extra, { recursive: true });
    await fs.writeFile(path.join(extra, 'driver.config.json'), '{"id":"extra"}');
    await fs.writeFile(path.join(keep, 'keep.h'), '// h');
    // A driver-only change doesn't make the (document-based) snapshot dirty on its own — touch a document too.
    await writeDocument(projectDir, doc('doc-1', 'v2'));
    const c2 = await store.commit({ kind: 'named', message: 'two drivers' });
    expect(c2).not.toBeNull();
    await expect(fs.readFile(path.join(extra, 'driver.config.json'), 'utf8')).resolves.toContain('extra');

    await store.restore((c1 as { id: string }).id);
    await expect(fs.access(extra)).rejects.toThrow();
    await expect(fs.access(path.join(keep, 'keep.h'))).rejects.toThrow();
    await expect(fs.readFile(path.join(keep, 'driver.config.json'), 'utf8')).resolves.toContain('keep');

    await store.restore((c2 as { id: string }).id);
    await expect(fs.readFile(path.join(extra, 'driver.config.json'), 'utf8')).resolves.toContain('extra');
  });

  it('a change only under falang/drivers/ or falang/config/ is dirty and makes a commit', async () => {
    await createDocument(projectDir, { document: doc('doc-1', 'v1'), folderId: null });
    const store = createGitVersionStore(projectDir, () => makeOptions());
    await expect(store.hasExtraChanges?.()).resolves.toBe(false);
    expect(await store.commit({ kind: 'named', message: 'base' })).not.toBeNull();
    await expect(store.hasExtraChanges?.()).resolves.toBe(false);
    await expect(store.commit({ kind: 'auto', message: 'nothing' })).resolves.toBeNull();

    const driver = path.join(driversDir(projectDir), 'blinker');
    await fs.mkdir(driver, { recursive: true });
    await fs.writeFile(path.join(driver, 'blinker.h'), '// v1');
    await expect(store.hasExtraChanges?.()).resolves.toBe(true);
    expect(await store.commit({ kind: 'auto', message: 'driver added' })).not.toBeNull();
    await expect(store.hasExtraChanges?.()).resolves.toBe(false);

    await fs.writeFile(path.join(driver, 'blinker.h'), '// version two');
    await expect(store.hasExtraChanges?.()).resolves.toBe(true);
    expect(await store.commit({ kind: 'auto', message: 'driver edited' })).not.toBeNull();

    await fs.rm(driver, { recursive: true });
    await expect(store.hasExtraChanges?.()).resolves.toBe(true);
    expect(await store.commit({ kind: 'auto', message: 'driver removed' })).not.toBeNull();
    await expect(store.commit({ kind: 'auto', message: 'nothing' })).resolves.toBeNull();

    await fs.mkdir(configDir(projectDir), { recursive: true });
    await fs.writeFile(path.join(configDir(projectDir), 'x.json'), '{"a":1}');
    await expect(store.hasExtraChanges?.()).resolves.toBe(true);
    expect(await store.commit({ kind: 'auto', message: 'config added' })).not.toBeNull();
    await fs.writeFile(path.join(configDir(projectDir), 'x.json'), '{"a":22}');
    expect(await store.commit({ kind: 'auto', message: 'config edited' })).not.toBeNull();
    await fs.rm(path.join(configDir(projectDir), 'x.json'));
    expect(await store.commit({ kind: 'auto', message: 'config removed' })).not.toBeNull();
    await expect(store.hasExtraChanges?.()).resolves.toBe(false);
  });

  it('empty drivers/config directories are not dirty, even with no repo or HEAD', async () => {
    const store = createGitVersionStore(projectDir, () => makeOptions());
    await fs.mkdir(driversDir(projectDir), { recursive: true });
    await expect(store.hasExtraChanges?.()).resolves.toBe(false);
    await expect(store.commit({ kind: 'auto', message: 'empty' })).resolves.toBeNull();
  });

  it('a driver-only first commit (no HEAD yet) is dirty and committable', async () => {
    const store = createGitVersionStore(projectDir, () => makeOptions());
    const driver = path.join(driversDir(projectDir), 'solo');
    await fs.mkdir(driver, { recursive: true });
    await fs.writeFile(path.join(driver, 'driver.config.json'), '{}');
    await expect(store.hasExtraChanges?.()).resolves.toBe(true);
    expect(await store.commit({ kind: 'auto', message: 'first' })).not.toBeNull();
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
    await expect(fs.access(path.join(documentsDir(projectDir), 'doc-2.json'))).rejects.toThrow();

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

    await expect(fs.access(path.join(documentsDir(projectDir), 'doc-2.json'))).rejects.toThrow();
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
    await fs.writeFile(path.join(documentsDir(projectDir), 'doc-1.json'), JSON.stringify(reordered, null, 2));

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

  describe('name-based layout (v5)', () => {
    it('commits, renames a document, and snapshots/restores across the rename', async () => {
      const folder = await createFolder(projectDir, { name: 'Game', parentId: null });
      await createDocument(projectDir, { document: { ...doc('doc-1', 'v1'), name: 'Draw food' }, folderId: folder.id });
      const store = createGitVersionStore(projectDir, () => makeOptions());
      const c1 = (await store.commit({ kind: 'named', message: 'first' })) as { id: string };
      expect(c1).not.toBeNull();

      await renameDocument(projectDir, 'doc-1', 'Draw drink');
      await renameFolder(projectDir, folder.id, 'Games');
      const c2 = (await store.commit({ kind: 'named', message: 'renamed' })) as { id: string };
      expect(c2).not.toBeNull();

      const snap1 = await store.getSnapshot(c1.id);
      const snap2 = await store.getSnapshot(c2.id);
      expect(snap1.documents[0]?.name).toBe('Draw food');
      expect(snap2.documents[0]?.name).toBe('Draw drink');
      // snapshots are content-only: no layout fields leak in
      expect(snap1.folders).toEqual([{ id: folder.id, name: 'Game', parentId: null }]);
      expect(snap1.documents[0]).not.toHaveProperty('fileName');

      await store.restore(c1.id);
      expect(await fs.readdir(path.join(documentsDir(projectDir), 'Game'))).toEqual(['Draw food.json']);
      await expect(fs.access(path.join(documentsDir(projectDir), 'Games'))).rejects.toThrow();
      expect((await readDocument(projectDir, 'doc-1')).name).toBe('Draw food');
      // restore leaves nothing dirty
      await expect(store.commit({ kind: 'auto', message: 'noop' })).resolves.toBeNull();
    });

    it('reads and restores a commit made in the v4 (flat <id>.json) layout', async () => {
      // hand-built v4 project, committed as-is
      await fs.writeFile(
        manifestPath(projectDir),
        JSON.stringify({
          name: 'My Project',
          type: 'text',
          formatVersion: 4,
          folders: [{ id: 'f1', name: 'Game', parentId: null }],
          documents: [{ id: 'doc-1', type: 'contour', name: 'Old name', folderId: 'f1' }],
        }),
      );
      await fs.writeFile(
        path.join(documentsDir(projectDir), 'doc-1.json'),
        JSON.stringify({ ...doc('doc-1', 'v1'), name: 'Old name' }),
      );
      const store = createGitVersionStore(projectDir, () => makeOptions());
      const v4Commit = (await store.commit({ kind: 'named', message: 'v4 era' })) as { id: string };
      expect(v4Commit).not.toBeNull();

      const snapshot = await store.getSnapshot(v4Commit.id);
      expect(snapshot.documents.map((d) => d.name)).toEqual(['Old name']);

      // upgrade to v5 and change something
      await openProject(projectDir);
      expect(await fs.readdir(path.join(documentsDir(projectDir), 'Game'))).toEqual(['Old name.json']);
      await writeDocument(projectDir, { ...doc('doc-1', 'v2'), name: 'Old name' });
      const v5Commit = (await store.commit({ kind: 'named', message: 'v5 era' })) as { id: string };
      expect(v5Commit).not.toBeNull();
      expect((await store.getSnapshot(v5Commit.id)).documents[0]?.root).toMatchObject({ data: { value: 'v2' } });

      // restoring the v4 commit yields a v5 layout again
      await store.restore(v4Commit.id);
      const manifest = await readManifest(projectDir);
      expect(manifest.formatVersion).toBe(5);
      expect(manifest.documents[0]?.fileName).toBe('Old name');
      expect(await fs.readdir(documentsDir(projectDir))).toEqual(['Game']);
      expect(await fs.readdir(path.join(documentsDir(projectDir), 'Game'))).toEqual(['Old name.json']);
      expect((await readDocument(projectDir, 'doc-1')).root).toMatchObject({ data: { value: 'v1' } });
    });
  });
});
