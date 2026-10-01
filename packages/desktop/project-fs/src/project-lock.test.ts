// oxlint-disable unicorn/no-await-expression-member, no-await-in-loop
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument, readDocument, renameDocument, writeDocument } from './documents.js';
import { createFolder, moveFolder, renameFolder } from './folders.js';
import { readManifest } from './manifest.js';
import { documentsDir } from './paths.js';
import { createProject } from './project.js';
import { withProjectLock } from './project-lock.js';

const makeDoc = (id: string, name: string, extra = ''): IProjectDocument => ({
  id,
  type: 'contour',
  name,
  root: { id: `${id}-root${extra}`, name: 'contour' },
});

const listJson = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(path.join(current, entry.name));
      else if (entry.name.endsWith('.json')) out.push(path.relative(dir, path.join(current, entry.name)));
    }
  };
  await walk(dir);
  return out.toSorted();
};

describe('per-project serialization', () => {
  let projectDir = '';
  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-lock-'));
    await createProject(projectDir, { name: 'p', type: 'text' });
  });
  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('rename racing several autosaves leaves exactly one file, at the new path, with the last content', async () => {
    await createDocument(projectDir, { document: makeDoc('d1', 'Old'), folderId: null });
    const writes = [1, 2, 3, 4, 5].map((n) => writeDocument(projectDir, makeDoc('d1', 'Old', `-v${n}`)));
    const rename = renameDocument(projectDir, 'd1', 'New');
    const lateWrites = [6, 7].map((n) => writeDocument(projectDir, makeDoc('d1', 'New', `-v${n}`)));
    await Promise.all([...writes, rename, ...lateWrites]);

    expect(await listJson(documentsDir(projectDir))).toEqual(['New.json']);
    expect((await readDocument(projectDir, 'd1')).name).toBe('New');
    const doc = await readDocument(projectDir, 'd1');
    expect(doc.root?.id).toBe('d1-root-v7');
  });

  it('folder rename/move racing document writes never strands a file', async () => {
    const folderA = await createFolder(projectDir, { name: 'A', parentId: null });
    const folderB = await createFolder(projectDir, { name: 'B', parentId: null });
    await createDocument(projectDir, { document: makeDoc('d1', 'Doc'), folderId: folderA.id });
    await Promise.all([
      writeDocument(projectDir, makeDoc('d1', 'Doc', '-a')),
      renameFolder(projectDir, folderA.id, 'A2'),
      writeDocument(projectDir, makeDoc('d1', 'Doc', '-b')),
      moveFolder(projectDir, folderA.id, folderB.id),
      writeDocument(projectDir, makeDoc('d1', 'Doc', '-c')),
    ]);
    expect(await listJson(documentsDir(projectDir))).toEqual(['B/A2/Doc.json']);
    const doc = await readDocument(projectDir, 'd1');
    expect(doc.root?.id).toBe('d1-root-c');
  });

  it('parallel createDocument calls all land in the manifest', async () => {
    const ids = Array.from({ length: 12 }, (_unused, index) => `d${index}`);
    await Promise.all(ids.map((id) => createDocument(projectDir, { document: makeDoc(id, 'Same'), folderId: null })));
    const manifest = await readManifest(projectDir);
    expect(manifest.documents.map((doc) => doc.id).toSorted()).toEqual([...ids].toSorted());
    expect(new Set(manifest.documents.map((doc) => doc.fileName?.toLowerCase())).size).toBe(ids.length);
    expect(await listJson(documentsDir(projectDir))).toHaveLength(ids.length);
  });

  it('a failing op does not poison the queue', async () => {
    const failing = withProjectLock(projectDir, () => Promise.reject(new Error('boom')));
    const ok = withProjectLock(projectDir, () => Promise.resolve(42));
    await expect(failing).rejects.toThrow('boom');
    await expect(ok).resolves.toBe(42);
  });
});
