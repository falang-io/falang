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
import { createProject } from './project.js';
import { readManifest } from './manifest.js';

describe('documents', () => {
  // oxlint-disable-next-line init-declarations
  let projectDir: string;

  const sampleDocument: IProjectDocument = {
    id: 'doc-1',
    type: 'contour',
    name: 'Main',
    root: { id: 'root-1', name: 'contour' },
  };

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'project-fs-test-'));
    await createProject(projectDir, { name: 'My Project', type: 'text' });
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('creates a document, adding it to the manifest and writing its payload file', async () => {
    await createDocument(projectDir, { document: sampleDocument, folderId: null });

    const manifest = await readManifest(projectDir);
    expect(manifest.documents).toEqual([{ id: 'doc-1', type: 'contour', name: 'Main', folderId: null }]);

    const read = await readDocument(projectDir, 'doc-1');
    expect(read).toEqual(sampleDocument);
  });

  it('rejects creating a document with a duplicate id', async () => {
    await createDocument(projectDir, { document: sampleDocument, folderId: null });
    await expect(createDocument(projectDir, { document: sampleDocument, folderId: null })).rejects.toThrow(
      /already exists/,
    );
  });

  it('round-trips writeDocument/readDocument for an updated payload', async () => {
    await createDocument(projectDir, { document: sampleDocument, folderId: null });
    const updated = { ...sampleDocument, root: { id: 'root-1', name: 'contour', children: [] } };
    await writeDocument(projectDir, updated);

    const read = await readDocument(projectDir, 'doc-1');
    expect(read).toEqual(updated);
  });

  it('renames a document in both the manifest and the payload file', async () => {
    await createDocument(projectDir, { document: sampleDocument, folderId: null });
    await renameDocument(projectDir, 'doc-1', 'Renamed');

    const manifest = await readManifest(projectDir);
    expect(manifest.documents[0]?.name).toBe('Renamed');
    const read = await readDocument(projectDir, 'doc-1');
    expect(read.name).toBe('Renamed');
  });

  it('moves a document to a different folder', async () => {
    await createDocument(projectDir, { document: sampleDocument, folderId: null });
    await moveDocument(projectDir, 'doc-1', 'folder-1');

    const manifest = await readManifest(projectDir);
    expect(manifest.documents[0]?.folderId).toBe('folder-1');
  });

  it('rejects moving a document that does not exist', async () => {
    await expect(moveDocument(projectDir, 'missing', 'folder-1')).rejects.toThrow(/not found/);
  });

  it('deletes a document, removing both its manifest entry and payload file', async () => {
    await createDocument(projectDir, { document: sampleDocument, folderId: null });
    await deleteDocument(projectDir, 'doc-1');

    const manifest = await readManifest(projectDir);
    expect(manifest.documents).toEqual([]);
    await expect(readDocument(projectDir, 'doc-1')).rejects.toThrow();
  });
});
