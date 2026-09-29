import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from './documents.js';
import { createFolder } from './folders.js';
import { createProject } from './project.js';
import { listTree } from './tree.js';

describe('listTree', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-test-'));
    await createProject(projectDir, { name: 'My Project', type: 'text' });
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('reflects folders and documents without reading document payload files', async () => {
    const folder = await createFolder(projectDir, { name: 'Folder A', parentId: null });
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'contour',
      name: 'Main',
      root: { id: 'r', name: 'contour' },
    };
    await createDocument(projectDir, { document, folderId: folder.id });

    const tree = await listTree(projectDir);
    expect(tree.folders).toEqual([{ id: folder.id, name: 'Folder A', parentId: null }]);
    expect(tree.documents).toEqual([{ id: 'doc-1', type: 'contour', name: 'Main', folderId: folder.id }]);
  });
});
