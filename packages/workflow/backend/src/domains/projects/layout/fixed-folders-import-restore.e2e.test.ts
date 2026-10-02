import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { Document } from '../documents/document.entity.js';
import { Folder } from '../folders/folder.entity.js';
import { ProjectCommit } from '../versioning/project-commit.entity.js';
import { makeFolderTestHelpers, sectionId, type ITreeDocument, type ITreeFolder } from './fixed-folders-helpers.js';
import { normalizeStoredProjectLayout } from './project-layout.js';

const doc = (id: string, type: string, name: string, folder: string | null) => ({
  id,
  type,
  name,
  folderId: folder,
  pinned: false,
  root: { id, name: type, children: [] },
});
const sortById = <T extends { id: string }>(items: T[]) => items.toSorted((a, b) => a.id.localeCompare(b.id));

describe('fixed workflow folders: import, restore, migration (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let token: string;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
    token = await login(app);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const { http, createProject, getTree, createDoc, createFolder } = makeFolderTestHelpers(
    () => app,
    () => token,
  );

  describe('import and templates', () => {
    it('normalises an old payload: root documents and a mixed folder, no sections in the file', async () => {
      const folderId = randomUUID();
      const emptyId = randomUUID();
      const docs = {
        trigger: randomUUID(),
        fnA: randomUUID(),
        fnB: randomUUID(),
        rootFn: randomUUID(),
      };
      const response = await http()
        .post('/projects/import')
        .set(auth(token))
        .send({
          formatVersion: 1,
          project: { id: '', name: 'Old' },
          folders: [
            { id: folderId, name: 'Telegram', parentId: null },
            { id: emptyId, name: 'Empty', parentId: null },
          ],
          documents: [
            doc(docs.trigger, 'trigger-function', 'onMessage', folderId),
            doc(docs.fnA, 'function', 'sendReply', folderId),
            doc(docs.fnB, 'function', 'formatPrice', folderId),
            doc(docs.rootFn, 'function', 'helper', null),
          ],
        });
      expect(response.status).toBe(201);
      const tree = await getTree(response.body.id);
      expect(tree.folders.filter((f) => f.fixedKind)).toHaveLength(3);
      expect(tree.folders.find((f) => f.name === 'Empty')).toBeUndefined();
      const telegram = tree.folders.filter((f) => f.name === 'Telegram');
      expect(telegram).toHaveLength(2);
      const parentKind = (f: ITreeFolder) => tree.folders.find((p) => p.id === f.parentId)?.fixedKind;
      expect(telegram.map((f) => parentKind(f)).toSorted()).toEqual(['functions', 'triggers']);
      const byName = (name: string) => tree.documents.find((d) => d.name === name) as ITreeDocument;
      const functionsTelegram = telegram.find((f) => parentKind(f) === 'functions') as ITreeFolder;
      const triggersTelegram = telegram.find((f) => parentKind(f) === 'triggers') as ITreeFolder;
      expect(byName('sendReply').folderId).toBe(functionsTelegram.id);
      expect(byName('formatPrice').folderId).toBe(functionsTelegram.id);
      expect(byName('onMessage').folderId).toBe(triggersTelegram.id);
      expect(byName('helper').folderId).toBe(sectionId(tree.folders, 'functions'));
      expect(tree.documents.find((d) => d.type === 'integrations')?.folderId).toBeNull();
    });

    it('maps exported section folders onto the seeded ones (round trip keeps three sections)', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const sub = await createFolder(projectId, 'Sub', sectionId(folders, 'types'));
      await createDoc(projectId, 'objects-structure', 'Order', sub.body.id);
      const exported = await http().get(`/projects/${projectId}/export`).set(auth(token));
      expect(exported.body.folders.filter((f: ITreeFolder) => f.fixedKind)).toHaveLength(3);
      const imported = await http().post('/projects/import').set(auth(token)).send(exported.body);
      expect(imported.status).toBe(201);
      const tree = await getTree(imported.body.id);
      expect(tree.folders).toHaveLength(4);
      const order = tree.documents.find((d) => d.name === 'Order');
      const subFolder = tree.folders.find((f) => f.name === 'Sub');
      expect(order?.folderId).toBe(subFolder?.id);
      expect(subFolder?.parentId).toBe(sectionId(tree.folders, 'types'));
    });
  });

  describe('restore', () => {
    it('restoring a pre-change commit keeps documents and sections and normalises the layout', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const functions = sectionId(folders, 'functions');
      const sub = await createFolder(projectId, 'Telegram', functions);
      const fn = await createDoc(projectId, 'function', 'sendReply', sub.body.id);
      const trigger = await createDoc(projectId, 'trigger-function', 'onMessage');
      const commit = await http()
        .post(`/projects/${projectId}/commits`)
        .set(auth(token))
        .send({ kind: 'named', message: 'before' });
      expect(commit.status).toBe(200);

      // Rewrite that commit into its pre-change shape: no section folders, root documents, a mixed folder.
      const commits = app.get<Repository<ProjectCommit>>(getRepositoryToken(ProjectCommit));
      const row = await commits.findOneByOrFail({ id: commit.body.id });
      const legacyFolderId = sub.body.id as string;
      row.tree = {
        folders: [{ id: legacyFolderId, name: 'Telegram', parentId: null }],
        documents: row.tree.documents.map((d) => ({
          ...d,
          folderId: d.id === fn.body.id || d.id === trigger.body.id ? legacyFolderId : null,
        })),
      };
      await commits.save(row);

      await http().delete(`/projects/${projectId}/documents/${fn.body.id}`).set(auth(token)).expect(204);
      await http().post(`/projects/${projectId}/commits/${commit.body.id}/restore`).set(auth(token)).expect(200);

      const tree = await getTree(projectId);
      expect(
        tree.folders
          .filter((f) => f.fixedKind)
          .map((f) => f.id)
          .toSorted(),
      ).toEqual(folders.map((f) => f.id).toSorted());
      expect(tree.documents.map((d) => d.name).toSorted()).toEqual(['Integrations', 'onMessage', 'sendReply']);
      const parentKind = (id: string | null) => {
        const folder = tree.folders.find((f) => f.id === id);
        return folder?.fixedKind ?? tree.folders.find((f) => f.id === folder?.parentId)?.fixedKind;
      };
      expect(parentKind(tree.documents.find((d) => d.name === 'sendReply')?.folderId ?? null)).toBe('functions');
      expect(parentKind(tree.documents.find((d) => d.name === 'onMessage')?.folderId ?? null)).toBe('triggers');
    });
  });

  describe('normalizeStoredProjectLayout (the migration step)', () => {
    it('normalises a legacy project in place and is idempotent', async () => {
      const projectId = await createProject();
      const folders = app.get<Repository<Folder>>(getRepositoryToken(Folder));
      const documents = app.get<Repository<Document>>(getRepositoryToken(Document));
      // Legacy shape: drop the sections, put documents at the root / in a mixed folder.
      const mixed = randomUUID();
      const fnId = randomUUID();
      const trId = randomUUID();
      const rootId = randomUUID();
      await folders.delete({ projectId });
      await folders.save(folders.create({ id: mixed, name: 'Mixed', parentId: null, projectId, fixedKind: null }));
      const make = (id: string, type: string, folderId: string | null) =>
        documents.save(
          documents.create({ id, type, name: id.slice(0, 4), folderId, projectId, root: null, data: null }),
        );
      await make(fnId, 'function', mixed);
      await make(trId, 'trigger-function', mixed);
      await make(rootId, 'function', null);

      await normalizeStoredProjectLayout(folders.manager, projectId);
      const first = await getTree(projectId);
      expect(first.folders.filter((f) => f.fixedKind)).toHaveLength(3);
      expect(first.documents.find((d) => d.id === rootId)?.folderId).toBe(sectionId(first.folders, 'functions'));
      expect(first.folders.filter((f) => f.name === 'Mixed')).toHaveLength(2);

      await normalizeStoredProjectLayout(folders.manager, projectId);
      const second = await getTree(projectId);
      expect(sortById(second.folders)).toEqual(sortById(first.folders));
      expect(sortById(second.documents)).toEqual(sortById(first.documents));
    });
  });
});
