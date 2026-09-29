import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProject, createDocument, listTree, type IProjectTree } from '@falang/desktop-project-fs';
import { DEVICES_DOCUMENT_NAME, DEVICES_DOCUMENT_TYPE } from '@falang/desktop-arduino-dto';
import { ensureArduinoProjectDocuments } from './ensure-project-documents.js';

const documentNames = (tree: IProjectTree): string[] => tree.documents.map((doc) => doc.name).toSorted();

describe('ensureArduinoProjectDocuments (ADR 0032 (private), "Found and fixed 2026-09-21")', () => {
  let projectDir = '';

  beforeEach(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-ensure-arduino-docs-'));
    await createProject(projectDir, { name: 'Test project', type: 'arduino' });
  });

  afterEach(async () => {
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('creates setup, loop and Devices for a fresh project', async () => {
    await ensureArduinoProjectDocuments(projectDir);
    const tree = await listTree(projectDir);
    expect(documentNames(tree)).toEqual(['Devices', 'loop', 'setup']);
    const devices = tree.documents.find((doc) => doc.type === DEVICES_DOCUMENT_TYPE);
    expect(devices?.name).toBe(DEVICES_DOCUMENT_NAME);
    const setup = tree.documents.find((doc) => doc.name === 'setup');
    expect(setup?.type).toBe('function');
  });

  it('creates nothing new on a second call (idempotent)', async () => {
    await ensureArduinoProjectDocuments(projectDir);
    const firstTree = await listTree(projectDir);
    const firstIds = firstTree.documents.map((doc) => doc.id).toSorted();
    await ensureArduinoProjectDocuments(projectDir);
    const tree = await listTree(projectDir);
    expect(documentNames(tree)).toEqual(['Devices', 'loop', 'setup']);
    expect(tree.documents.map((doc) => doc.id).toSorted()).toEqual(firstIds);
  });

  it('creates exactly three documents even when two calls race on the same fresh project', async () => {
    await Promise.all([ensureArduinoProjectDocuments(projectDir), ensureArduinoProjectDocuments(projectDir)]);
    const tree = await listTree(projectDir);
    expect(documentNames(tree)).toEqual(['Devices', 'loop', 'setup']);
  });

  it('backfills only the missing Devices document for a project that already has setup/loop', async () => {
    await createDocument(projectDir, {
      document: {
        id: 'setup-id',
        type: 'function',
        name: 'setup',
        root: { id: 'setup-root', name: 'function', children: [] },
      },
      folderId: null,
    });
    await createDocument(projectDir, {
      document: {
        id: 'loop-id',
        type: 'function',
        name: 'loop',
        root: { id: 'loop-root', name: 'function', children: [] },
      },
      folderId: null,
    });

    await ensureArduinoProjectDocuments(projectDir);

    const tree = await listTree(projectDir);
    expect(documentNames(tree)).toEqual(['Devices', 'loop', 'setup']);
    // setup/loop weren't recreated — same ids as the ones seeded above.
    expect(tree.documents.find((doc) => doc.name === 'setup')?.id).toBe('setup-id');
    expect(tree.documents.find((doc) => doc.name === 'loop')?.id).toBe('loop-id');
  });
});
