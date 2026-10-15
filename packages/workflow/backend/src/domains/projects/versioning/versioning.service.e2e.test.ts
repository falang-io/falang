import { NotFoundException, type INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { Project } from '../projects/project.entity.js';
import { ProjectBlob } from './project-blob.entity.js';
import { VersioningService } from './versioning.service.js';

/** `VersioningService` called directly (not through HTTP) — the paths the controller does not reach or reaches only indirectly. */
describe('VersioningService (e2e harness)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const server = () => app.getHttpServer();
  const service = () => app.get(VersioningService);

  const createProject = async (
    token: string,
  ): Promise<{ projectId: string; ownerId: string; integrationsDocId: string }> => {
    const response = await request(server()).post('/projects').set(auth(token)).send({ name: 'P' });
    const projectId: string = response.body.id;
    const project = await app.get<Repository<Project>>(getRepositoryToken(Project)).findOneByOrFail({ id: projectId });
    const tree = await request(server()).get(`/projects/${projectId}/tree`).set(auth(token));
    return { projectId, ownerId: project.ownerId, integrationsDocId: tree.body.documents[0].id };
  };

  it('headCommit is null for a project without commits, then the newest commit with its author name', async () => {
    const token = await login(app);
    const { projectId, ownerId } = await createProject(token);
    await expect(service().headCommit(projectId, ownerId)).resolves.toBeNull();

    const created = await service().commit(projectId, ownerId, { kind: 'named', message: 'First' });

    await expect(service().headCommit(projectId, ownerId)).resolves.toEqual(created);
    expect(created?.author).toBe('admin');
  });

  it('getWorkingCopy returns the working copy with secrets blanked', async () => {
    const token = await login(app);
    const { projectId, ownerId, integrationsDocId } = await createProject(token);
    await request(server())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            { id: 'c1', vendor: 'telegram', name: 'Bot', fields: { botToken: { dev: 'raw-secret-token', prod: '' } } },
          ],
        },
      })
      .expect(200);

    const snapshot = await service().getWorkingCopy(projectId, ownerId);

    const serialized = JSON.stringify(snapshot);
    expect(serialized).toContain('Bot');
    expect(serialized).not.toContain('raw-secret-token');
  });

  it('restoring the commit that is already HEAD is a no-op that returns HEAD without a new commit', async () => {
    const token = await login(app);
    const { projectId, ownerId } = await createProject(token);
    const head = await service().commit(projectId, ownerId, { kind: 'named', message: 'Only' });
    if (!head) throw new Error('expected a commit');

    const restored = await service().restore(projectId, ownerId, head.id);

    expect(restored.id).toBe(head.id);
    await expect(service().listCommits(projectId, ownerId)).resolves.toHaveLength(1);
  });

  it('getSnapshot fails with NotFound when a blob of the commit is missing', async () => {
    const token = await login(app);
    const { projectId, ownerId } = await createProject(token);
    const head = await service().commit(projectId, ownerId, { kind: 'named', message: 'Only' });
    if (!head) throw new Error('expected a commit');
    await app.get<Repository<ProjectBlob>>(getRepositoryToken(ProjectBlob)).delete({ projectId });

    await expect(service().getSnapshot(projectId, ownerId, head.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses a commit id of another project', async () => {
    const token = await login(app);
    const a = await createProject(token);
    const b = await createProject(token);
    const head = await service().commit(a.projectId, a.ownerId, { kind: 'named', message: 'A' });
    if (!head) throw new Error('expected a commit');

    await expect(service().nameCommit(b.projectId, b.ownerId, head.id, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
