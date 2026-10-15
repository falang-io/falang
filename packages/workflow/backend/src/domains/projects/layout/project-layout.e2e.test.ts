import { BadRequestException, UnprocessableEntityException, type INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { Repository } from 'typeorm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_MASK } from '@falang/workflow-integrations-common';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { Document } from '../documents/document.entity.js';
import { DocumentsService } from '../documents/documents.service.js';
import { Folder } from '../folders/folder.entity.js';
import { FoldersService } from '../folders/folders.service.js';
import { Project } from '../projects/project.entity.js';
import { normalizeStoredProjectLayout, requireSectionFolderId, resolveDocumentFolder } from './project-layout.js';

describe('project layout helpers and write error paths (e2e harness)', () => {
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
    vi.restoreAllMocks();
    await app.close();
    vi.unstubAllEnvs();
  });

  const folderRepo = () => app.get<Repository<Folder>>(getRepositoryToken(Folder));
  const documentRepo = () => app.get<Repository<Document>>(getRepositoryToken(Document));

  const createProject = async (): Promise<{ projectId: string; ownerId: string }> => {
    const response = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = response.body.id;
    const project = await app.get<Repository<Project>>(getRepositoryToken(Project)).findOneByOrFail({ id: projectId });
    return { projectId, ownerId: project.ownerId };
  };

  const removeSections = (projectId: string) => folderRepo().delete({ projectId });

  it('resolveDocumentFolder creates missing sections and returns the document type section', async () => {
    const { projectId } = await createProject();
    await removeSections(projectId);
    expect(await folderRepo().countBy({ projectId })).toBe(0);

    const target = await resolveDocumentFolder(folderRepo(), projectId, 'function', null);

    const section = await folderRepo().findOneByOrFail({ projectId, fixedKind: 'functions' });
    expect(target).toBe(section.id);
    expect(await folderRepo().countBy({ projectId, fixedKind: 'triggers' })).toBe(1);
  });

  it('resolveDocumentFolder rejects a folder of the wrong section with 422', async () => {
    const { projectId } = await createProject();
    const triggers = await folderRepo().findOneByOrFail({ projectId, fixedKind: 'triggers' });

    await expect(resolveDocumentFolder(folderRepo(), projectId, 'function', triggers.id)).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('requireSectionFolderId creates sections on demand and throws for an unknown kind', async () => {
    const { projectId } = await createProject();
    await removeSections(projectId);

    const id = await requireSectionFolderId(folderRepo().manager, projectId, 'types');

    await expect(folderRepo().findOneByOrFail({ id })).resolves.toMatchObject({ fixedKind: 'types' });
    await expect(requireSectionFolderId(folderRepo().manager, projectId, 'nope')).rejects.toThrow(
      /Section folder "nope" is missing/,
    );
  });

  it('normalizeStoredProjectLayout drops empty user folder trees (children first) and moves stray documents into their section', async () => {
    const { projectId } = await createProject();
    const outer = randomUUID();
    const inner = randomUUID();
    await folderRepo().insert({ id: outer, name: 'Empty', parentId: null, projectId, fixedKind: null });
    await folderRepo().insert({ id: inner, name: 'Inner', parentId: outer, projectId, fixedKind: null });
    const docId = randomUUID();
    await documentRepo().insert({
      id: docId,
      projectId,
      type: 'function',
      name: 'stray',
      folderId: null,
      root: { id: docId, name: 'function', children: [] },
    } as never);

    await normalizeStoredProjectLayout(folderRepo().manager, projectId);

    expect(await folderRepo().existsBy({ id: outer })).toBe(false);
    expect(await folderRepo().existsBy({ id: inner })).toBe(false);
    const functions = await folderRepo().findOneByOrFail({ projectId, fixedKind: 'functions' });
    await expect(documentRepo().findOneByOrFail({ id: docId })).resolves.toMatchObject({ folderId: functions.id });
  });

  it('FoldersService.create with a parent from no folder of this project is a 400, even for a system write', async () => {
    const { projectId, ownerId } = await createProject();

    await expect(
      app
        .get(FoldersService)
        .create(projectId, ownerId, { id: randomUUID(), name: 'x', parentId: randomUUID() }, { system: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('FoldersService.create rethrows an insert failure that is not a duplicate id', async () => {
    const { projectId, ownerId } = await createProject();
    vi.spyOn(folderRepo(), 'insert').mockRejectedValue(new Error('disk full'));

    await expect(
      app.get(FoldersService).create(projectId, ownerId, { id: randomUUID(), name: 'x' }, { system: true }),
    ).rejects.toThrow('disk full');
  });

  it('DocumentsService.create rethrows an insert failure that is not a duplicate id', async () => {
    const { projectId, ownerId } = await createProject();
    vi.spyOn(documentRepo(), 'insert').mockRejectedValue(new Error('disk full'));
    const id = randomUUID();

    await expect(
      app.get(DocumentsService).create(projectId, ownerId, {
        id,
        type: 'function',
        name: 'f',
        root: { id, name: 'function', children: [] },
      } as never),
    ).rejects.toThrow('disk full');
  });

  it('listTree reports lockedUntil for a locked document and nothing for an unlocked one', async () => {
    const { projectId, ownerId } = await createProject();
    const documents = app.get(DocumentsService);
    const id = randomUUID();
    await documents.create(projectId, ownerId, {
      id,
      type: 'function',
      name: 'locked',
      root: { id, name: 'function', children: [] },
    } as never);

    await documents.lockDocument(projectId, ownerId, id, 'agent', 60_000);
    const tree = await documents.listTree(projectId, ownerId);

    expect(tree.find((doc) => doc.id === id)?.lockedUntil).toEqual(expect.any(String));
    expect(tree.filter((doc) => doc.id !== id).every((doc) => doc.lockedUntil === undefined)).toBe(true);
  });

  it('listFull masks integration secrets in the integrations document', async () => {
    const { projectId, ownerId } = await createProject();
    const integrationsDoc = await documentRepo().findOneByOrFail({ projectId, type: 'integrations' });
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDoc.id}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            { id: 'c1', vendor: 'telegram', name: 'Bot', fields: { botToken: { dev: 'raw-secret-token', prod: '' } } },
          ],
        },
      })
      .expect(200);

    const documents = await app.get(DocumentsService).listFull(projectId, ownerId);

    const serialized = JSON.stringify(documents.find((doc) => doc.type === 'integrations'));
    expect(serialized).toContain('Bot');
    expect(serialized).not.toContain('raw-secret-token');
    expect(serialized).toContain(SECRET_MASK);
  });
});
