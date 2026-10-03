// oxlint-disable unicorn/no-await-expression-member, max-lines, unicorn/consistent-function-scoping, unicorn/no-array-sort, no-undefined, unicorn/escape-case, unicorn/prefer-string-raw
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDocument,
  deleteDocument,
  moveDocument,
  readDocument,
  renameDocument,
  writeDocument,
} from './documents.js';
import { createFolder, deleteFolder, moveFolder, renameFolder } from './folders.js';
import { readManifest } from './manifest.js';
import { createProject, openProject } from './project.js';
import { reconcileProjectLayout } from './reconcile-layout.js';
import { listTree } from './tree.js';
import { documentsDir, manifestPath } from './paths.js';

const makeDoc = (id: string, name: string): IProjectDocument => ({
  id,
  type: 'contour',
  name,
  root: { id: `${id}-root`, name: 'contour' },
});

/** Every file/dir under `falang/schemes/` as sorted POSIX-relative paths (dirs with a trailing slash). */
const listLayout = async (projectDir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        out.push(`${prefix}${entry.name}/`);
        // oxlint-disable-next-line no-await-in-loop
        await walk(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else out.push(`${prefix}${entry.name}`);
    }
  };
  await walk(documentsDir(projectDir), '');
  return out.sort();
};

describe('name-based layout', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-layout-test-'));
    await createProject(projectDir, { name: 'P', type: 'text' });
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('stores a document in nested folder directories named after the tree', async () => {
    const game = await createFolder(projectDir, { name: 'Game', parentId: null });
    const render = await createFolder(projectDir, { name: 'Render', parentId: game.id });
    await createDocument(projectDir, { document: makeDoc('d1', 'Draw food'), folderId: render.id });

    expect(await listLayout(projectDir)).toEqual(['Game/', 'Game/Render/', 'Game/Render/Draw food.json']);
    expect((await readDocument(projectDir, 'd1')).name).toBe('Draw food');
  });

  it('creates empty folders on disk and listTree hides on-disk segments', async () => {
    const f = await createFolder(projectDir, { name: 'Empty', parentId: null });
    expect(await listLayout(projectDir)).toEqual(['Empty/']);
    await createDocument(projectDir, { document: makeDoc('d1', 'x'), folderId: null });
    const tree = await listTree(projectDir);
    expect(tree.folders).toEqual([{ id: f.id, name: 'Empty', parentId: null }]);
    expect(tree.documents).toEqual([{ id: 'd1', type: 'contour', name: 'x', folderId: null }]);
  });

  it('dedups colliding names, case-insensitively', async () => {
    await createDocument(projectDir, { document: makeDoc('d1', 'Main'), folderId: null });
    await createDocument(projectDir, { document: makeDoc('d2', 'main'), folderId: null });
    await createDocument(projectDir, { document: makeDoc('d3', 'Main'), folderId: null });
    expect(await listLayout(projectDir)).toEqual(['Main (3).json', 'Main.json', 'main (2).json']);
  });

  it('sanitizes forbidden characters in names but keeps the real name in the manifest', async () => {
    await createDocument(projectDir, { document: makeDoc('d1', 'a/b: c?'), folderId: null });
    expect(await listLayout(projectDir)).toEqual(['a_b_ c_.json']);
    expect((await readManifest(projectDir)).documents[0]?.name).toBe('a/b: c?');
  });

  it('renames a document file, updating the name in the payload', async () => {
    await createDocument(projectDir, { document: makeDoc('d1', 'Old'), folderId: null });
    await renameDocument(projectDir, 'd1', 'New name');
    expect(await listLayout(projectDir)).toEqual(['New name.json']);
    expect((await readDocument(projectDir, 'd1')).name).toBe('New name');
  });

  it('handles a case-only rename and a rename to the own name', async () => {
    await createDocument(projectDir, { document: makeDoc('d1', 'main'), folderId: null });
    await renameDocument(projectDir, 'd1', 'MAIN');
    expect(await listLayout(projectDir)).toEqual(['MAIN.json']);
    await renameDocument(projectDir, 'd1', 'MAIN');
    expect(await listLayout(projectDir)).toEqual(['MAIN.json']);
  });

  it('moves a document between folders and prunes nothing it still needs', async () => {
    const a = await createFolder(projectDir, { name: 'A', parentId: null });
    const b = await createFolder(projectDir, { name: 'B', parentId: null });
    await createDocument(projectDir, { document: makeDoc('d1', 'Doc'), folderId: a.id });
    await createDocument(projectDir, { document: makeDoc('d2', 'Doc'), folderId: b.id });
    await moveDocument(projectDir, 'd1', b.id);
    expect(await listLayout(projectDir)).toEqual(['A/', 'B/', 'B/Doc (2).json', 'B/Doc.json']);
    await moveDocument(projectDir, 'd1', null);
    expect(await listLayout(projectDir)).toEqual(['A/', 'B/', 'B/Doc.json', 'Doc.json']);
    expect((await readDocument(projectDir, 'd1')).id).toBe('d1');
  });

  it('renames and moves a folder with its content', async () => {
    const a = await createFolder(projectDir, { name: 'A', parentId: null });
    const b = await createFolder(projectDir, { name: 'B', parentId: a.id });
    await createDocument(projectDir, { document: makeDoc('d1', 'Doc'), folderId: b.id });

    await renameFolder(projectDir, a.id, 'Alpha');
    expect(await listLayout(projectDir)).toEqual(['Alpha/', 'Alpha/B/', 'Alpha/B/Doc.json']);

    await moveFolder(projectDir, b.id, null);
    expect(await listLayout(projectDir)).toEqual(['Alpha/', 'B/', 'B/Doc.json']);
    expect((await readDocument(projectDir, 'd1')).id).toBe('d1');

    await renameFolder(projectDir, b.id, 'b');
    expect(await listLayout(projectDir)).toEqual(['Alpha/', 'b/', 'b/Doc.json']);
  });

  it('delete removes files, and a folder delete removes its directory recursively', async () => {
    const a = await createFolder(projectDir, { name: 'A', parentId: null });
    const b = await createFolder(projectDir, { name: 'B', parentId: a.id });
    await createDocument(projectDir, { document: makeDoc('d1', 'One'), folderId: b.id });
    await createDocument(projectDir, { document: makeDoc('d2', 'Two'), folderId: null });

    await deleteDocument(projectDir, 'd2');
    expect(await listLayout(projectDir)).toEqual(['A/', 'A/B/', 'A/B/One.json']);

    await deleteFolder(projectDir, a.id);
    expect(await listLayout(projectDir)).toEqual([]);
  });

  it('prunes empty stray directories but keeps manifest folders', async () => {
    await createFolder(projectDir, { name: 'Keep', parentId: null });
    await fs.mkdir(path.join(documentsDir(projectDir), 'stray', 'deeper'), { recursive: true });
    await createDocument(projectDir, { document: makeDoc('d1', 'x'), folderId: null });
    await deleteDocument(projectDir, 'd1');
    expect(await listLayout(projectDir)).toEqual(['Keep/']);
  });

  it('writeDocument updates the file at the resolved path', async () => {
    const f = await createFolder(projectDir, { name: 'F', parentId: null });
    await createDocument(projectDir, { document: makeDoc('d1', 'Doc'), folderId: f.id });
    await writeDocument(projectDir, { ...makeDoc('d1', 'Doc'), root: { id: 'r', name: 'contour', children: [] } });
    const onDisk = JSON.parse(await fs.readFile(path.join(documentsDir(projectDir), 'F', 'Doc.json'), 'utf8')) as {
      root: { id: string };
    };
    expect(onDisk.root.id).toBe('r');
  });

  describe('v4 → v5 migration and self-healing', () => {
    const writeV4 = async (): Promise<void> => {
      await fs.writeFile(
        manifestPath(projectDir),
        JSON.stringify({
          name: 'P',
          type: 'text',
          formatVersion: 4,
          folders: [
            { id: 'f1', name: 'Game', parentId: null },
            { id: 'f2', name: 'Render', parentId: 'f1' },
          ],
          documents: [
            { id: 'a', type: 'contour', name: 'Alpha', folderId: 'f2' },
            { id: 'b', type: 'contour', name: 'a', folderId: null },
            { id: 'c', type: 'contour', name: 'Alpha', folderId: 'f2' },
          ],
        }),
      );
      for (const id of ['a', 'b', 'c']) {
        // oxlint-disable-next-line no-await-in-loop
        await fs.writeFile(path.join(documentsDir(projectDir), `${id}.json`), JSON.stringify(makeDoc(id, id)));
      }
    };

    it('openProject moves flat <id>.json files into the name-based tree and bumps the version', async () => {
      await writeV4();
      const manifest = await openProject(projectDir);

      expect(manifest.formatVersion).toBe(5);
      expect(await listLayout(projectDir)).toEqual([
        'Game/',
        'Game/Render/',
        'Game/Render/Alpha (2).json',
        'Game/Render/Alpha.json',
        'a.json',
      ]);
      expect((await readManifest(projectDir)).documents.map((d) => d.fileName)).toEqual(['Alpha', 'a', 'Alpha (2)']);
      expect((await readDocument(projectDir, 'c')).id).toBe('c');

      // idempotent: a second open changes nothing
      const before = await fs.readFile(manifestPath(projectDir), 'utf8');
      await openProject(projectDir);
      expect(await fs.readFile(manifestPath(projectDir), 'utf8')).toBe(before);
    });

    it("does not clobber when one document's target is another one's legacy file", async () => {
      await fs.writeFile(
        manifestPath(projectDir),
        JSON.stringify({
          name: 'P',
          type: 'text',
          formatVersion: 4,
          folders: [],
          documents: [
            { id: 'x', type: 'contour', name: 'y', folderId: null },
            { id: 'y', type: 'contour', name: 'z', folderId: null },
          ],
        }),
      );
      await fs.writeFile(path.join(documentsDir(projectDir), 'x.json'), JSON.stringify(makeDoc('x', 'y')));
      await fs.writeFile(path.join(documentsDir(projectDir), 'y.json'), JSON.stringify(makeDoc('y', 'z')));
      await openProject(projectDir);
      expect(await listLayout(projectDir)).toEqual(['y.json', 'z.json']);
      expect((await readDocument(projectDir, 'x')).id).toBe('x');
      expect((await readDocument(projectDir, 'y')).id).toBe('y');
    });

    it('reconcile finds a file moved elsewhere by its id, and leaves unknown json alone', async () => {
      const f = await createFolder(projectDir, { name: 'F', parentId: null });
      await createDocument(projectDir, { document: makeDoc('d1', 'Doc'), folderId: f.id });
      await fs.mkdir(path.join(documentsDir(projectDir), 'elsewhere'), { recursive: true });
      await fs.rename(
        path.join(documentsDir(projectDir), 'F', 'Doc.json'),
        path.join(documentsDir(projectDir), 'elsewhere', 'whatever.json'),
      );
      await fs.writeFile(path.join(documentsDir(projectDir), 'unknown.json'), JSON.stringify({ id: 'nope' }));

      await reconcileProjectLayout(projectDir);
      expect(await listLayout(projectDir)).toEqual(['F/', 'F/Doc.json', 'unknown.json']);
    });

    it('readDocument repairs a drifted layout on the fly', async () => {
      await createDocument(projectDir, { document: makeDoc('d1', 'Doc'), folderId: null });
      await fs.rename(
        path.join(documentsDir(projectDir), 'Doc.json'),
        path.join(documentsDir(projectDir), 'moved.json'),
      );
      expect((await readDocument(projectDir, 'd1')).id).toBe('d1');
      expect(await listLayout(projectDir)).toEqual(['Doc.json']);
    });
  });
});
