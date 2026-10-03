import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument, readDocument } from './documents.js';
import { createFolder, deleteFolder, moveFolder, renameFolder } from './folders.js';
import { readManifest } from './manifest.js';
import { createProject } from './project.js';

const doc = (id: string): IProjectDocument => ({
  id,
  type: 'contour',
  name: id,
  root: { id: `${id}-root`, name: 'contour' },
});

describe('folders', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-test-'));
    await createProject(projectDir, { name: 'My Project', type: 'text' });
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('creates a folder and adds it to the manifest', async () => {
    const folder = await createFolder(projectDir, { name: 'Folder A', parentId: null });
    const manifest = await readManifest(projectDir);
    expect(manifest.folders).toEqual([{ id: folder.id, name: 'Folder A', parentId: null, dirName: 'Folder A' }]);
  });

  it('renames a folder', async () => {
    const folder = await createFolder(projectDir, { name: 'Folder A', parentId: null });
    await renameFolder(projectDir, folder.id, 'Renamed');
    const manifest = await readManifest(projectDir);
    expect(manifest.folders[0]?.name).toBe('Renamed');
  });

  it('moves a folder under a different parent', async () => {
    const a = await createFolder(projectDir, { name: 'A', parentId: null });
    const b = await createFolder(projectDir, { name: 'B', parentId: null });
    await moveFolder(projectDir, b.id, a.id);

    const manifest = await readManifest(projectDir);
    expect(manifest.folders.find((f) => f.id === b.id)?.parentId).toBe(a.id);
  });

  it('rejects moving a folder into itself', async () => {
    const a = await createFolder(projectDir, { name: 'A', parentId: null });
    await expect(moveFolder(projectDir, a.id, a.id)).rejects.toThrow(/into itself/);
  });

  it('rejects moving a folder into its own descendant', async () => {
    const parent = await createFolder(projectDir, { name: 'Parent', parentId: null });
    const child = await createFolder(projectDir, { name: 'Child', parentId: parent.id });
    await expect(moveFolder(projectDir, parent.id, child.id)).rejects.toThrow(/own descendant/);
  });

  it('cascades delete to nested folders and their documents', async () => {
    const parent = await createFolder(projectDir, { name: 'Parent', parentId: null });
    const child = await createFolder(projectDir, { name: 'Child', parentId: parent.id });
    const sibling = await createFolder(projectDir, { name: 'Sibling', parentId: null });

    await createDocument(projectDir, { document: doc('in-parent'), folderId: parent.id });
    await createDocument(projectDir, { document: doc('in-child'), folderId: child.id });
    await createDocument(projectDir, { document: doc('in-sibling'), folderId: sibling.id });

    await deleteFolder(projectDir, parent.id);

    const manifest = await readManifest(projectDir);
    expect(manifest.folders.map((f) => f.id)).toEqual([sibling.id]);
    expect(manifest.documents.map((d) => d.id)).toEqual(['in-sibling']);

    await expect(readDocument(projectDir, 'in-parent')).rejects.toThrow();
    await expect(readDocument(projectDir, 'in-child')).rejects.toThrow();
    await expect(readDocument(projectDir, 'in-sibling')).resolves.toBeTruthy();
  });
});
