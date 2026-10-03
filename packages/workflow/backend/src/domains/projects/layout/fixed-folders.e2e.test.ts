import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { makeFolderTestHelpers, sectionId, statusOf } from './fixed-folders-helpers.js';

describe('fixed workflow folders (e2e)', () => {
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

  it('seeds the three section folders next to Integrations', async () => {
    const projectId = await createProject();
    const tree = await getTree(projectId);
    expect(tree.folders.map((f) => f.fixedKind).toSorted()).toEqual(['functions', 'triggers', 'types']);
    expect(tree.folders.every((f) => f.parentId === null)).toBe(true);
    expect(tree.documents).toHaveLength(1);
  });

  describe('defaulting', () => {
    it('puts a document created without a folder (or with null) into its section root', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const fn = await createDoc(projectId, 'function', 'sendReply');
      expect(fn.status).toBe(201);
      const trigger = await createDoc(projectId, 'trigger-function', 'onMessage', null);
      expect(trigger.status).toBe(201);
      const types = await createDoc(projectId, 'objects-structure', 'Order');
      expect(types.status).toBe(201);
      const tree = await getTree(projectId);
      const folderOf = (name: string) => tree.documents.find((d) => d.name === name)?.folderId;
      expect(folderOf('sendReply')).toBe(sectionId(folders, 'functions'));
      expect(folderOf('onMessage')).toBe(sectionId(folders, 'triggers'));
      expect(folderOf('Order')).toBe(sectionId(folders, 'types'));
    });

    it('moves a document with folderId null to its section root', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const sub = await createFolder(projectId, 'Sub', sectionId(folders, 'functions'));
      const doc = await createDoc(projectId, 'function', 'run', sub.body.id);
      expect(doc.status).toBe(201);
      await http()
        .patch(`/projects/${projectId}/documents/${doc.body.id}`)
        .set(auth(token))
        .send({ folderId: null })
        .expect(200);
      const tree = await getTree(projectId);
      expect(tree.documents.find((d) => d.id === doc.body.id)?.folderId).toBe(sectionId(folders, 'functions'));
    });
  });

  describe('document placement (422)', () => {
    it('rejects a document in the wrong section, naming the right one', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const response = await createDoc(projectId, 'function', 'run', sectionId(folders, 'triggers'));
      expect(response.status).toBe(422);
      expect(response.body.message).toContain(`Functions (id ${sectionId(folders, 'functions')})`);
    });

    it('rejects moving a document into another section, or into a folder that does not exist', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const doc = await createDoc(projectId, 'function', 'run');
      await http()
        .patch(`/projects/${projectId}/documents/${doc.body.id}`)
        .set(auth(token))
        .send({ folderId: sectionId(folders, 'types') })
        .expect(422);
      await http()
        .patch(`/projects/${projectId}/documents/${doc.body.id}`)
        .set(auth(token))
        .send({ folderId: randomUUID() })
        .expect(422);
    });

    it("rejects a folder of another project's tree", async () => {
      const projectId = await createProject();
      const otherId = await createProject('other');
      const other = await getTree(otherId);
      const response = await createDoc(projectId, 'function', 'run', sectionId(other.folders, 'functions'));
      expect(response.status).toBe(422);
    });
  });

  describe('folder rules', () => {
    it('rejects a folder at the root (null or omitted parent)', async () => {
      const projectId = await createProject();
      expect(await statusOf(createFolder(projectId, 'Loose'))).toBe(422);
      expect(await statusOf(createFolder(projectId, 'Loose', null))).toBe(422);
    });

    it('rejects a parent that does not exist', async () => {
      const projectId = await createProject();
      expect(await statusOf(createFolder(projectId, 'Orphan', randomUUID()))).toBe(422);
    });

    it('forbids renaming, moving and deleting a fixed folder', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const triggers = sectionId(folders, 'triggers');
      await http().patch(`/projects/${projectId}/folders/${triggers}`).set(auth(token)).send({ name: 'X' }).expect(403);
      await http()
        .patch(`/projects/${projectId}/folders/${triggers}`)
        .set(auth(token))
        .send({ parentId: sectionId(folders, 'types') })
        .expect(403);
      await http().delete(`/projects/${projectId}/folders/${triggers}`).set(auth(token)).expect(403);
    });

    it('rejects cycles and cross-section moves, allows moves inside a section', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const a = await createFolder(projectId, 'A', sectionId(folders, 'functions'));
      const b = await createFolder(projectId, 'B', a.body.id);
      const c = await createFolder(projectId, 'C', sectionId(folders, 'functions'));
      const patch = (id: string, body: object) =>
        http().patch(`/projects/${projectId}/folders/${id}`).set(auth(token)).send(body);
      expect(await statusOf(patch(a.body.id, { parentId: b.body.id }))).toBe(422);
      expect(await statusOf(patch(a.body.id, { parentId: a.body.id }))).toBe(422);
      expect(await statusOf(patch(a.body.id, { parentId: sectionId(folders, 'triggers') }))).toBe(422);
      expect(await statusOf(patch(b.body.id, { parentId: c.body.id }))).toBe(200);
      expect(await statusOf(patch(b.body.id, { name: 'B2' }))).toBe(200);
      const tree = await getTree(projectId);
      expect(tree.folders.find((f) => f.id === b.body.id)).toMatchObject({ name: 'B2', parentId: c.body.id });
    });

    it('lets a user rename and delete their own folder', async () => {
      const projectId = await createProject();
      const { folders } = await getTree(projectId);
      const a = await createFolder(projectId, 'A', sectionId(folders, 'types'));
      await http()
        .patch(`/projects/${projectId}/folders/${a.body.id}`)
        .set(auth(token))
        .send({ name: 'B' })
        .expect(200);
      await http().delete(`/projects/${projectId}/folders/${a.body.id}`).set(auth(token)).expect(204);
    });
  });

  describe('pinned documents', () => {
    it('forbids renaming and moving Integrations, but tolerates an unchanged name', async () => {
      const projectId = await createProject();
      const tree = await getTree(projectId);
      const integrations = tree.documents[0];
      const url = `/projects/${projectId}/documents/${integrations?.id}`;
      await http().patch(url).set(auth(token)).send({ name: 'Renamed' }).expect(403);
      await http()
        .patch(url)
        .set(auth(token))
        .send({ folderId: sectionId(tree.folders, 'functions') })
        .expect(403);
      await http().patch(url).set(auth(token)).send({ name: 'Integrations' }).expect(200);
    });
  });
});
