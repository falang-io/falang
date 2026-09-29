import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { DocumentsService } from './documents.service.js';

const ONE_MINUTE_MS = 60_000;

const getUserId = async (app: INestApplication, token: string): Promise<string> => {
  const response = await request(app.getHttpServer()).get('/auth/me').set(auth(token));
  return response.body.id as string;
};

describe('document locks (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let documentsService: DocumentsService;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
    documentsService = app.get(DocumentsService);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const setUpDocument = async (token: string) => {
    const projectResponse = await request(app.getHttpServer())
      .post('/projects')
      .set(auth(token))
      .send({ name: 'Locks project' })
      .expect(201);
    const projectId: string = projectResponse.body.id;

    const docId = '22222222-2222-4222-8222-222222222222';
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({
        id: docId,
        type: 'function',
        name: 'run',
        folderId: null,
        root: { id: docId, name: 'function', children: [] },
      })
      .expect(201);

    return { projectId, docId };
  };

  it('has no locks for a fresh document', async () => {
    const token = await login(app);
    const { projectId } = await setUpDocument(token);

    const locksResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents/locks`)
      .set(auth(token))
      .expect(200);
    expect(locksResponse.body).toEqual([]);
  });

  it('lockDocument locks, appears in getLocks and the tree listing, and blocks a PATCH with 409', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);
    const adminId = await getUserId(app, token);

    const lock = await documentsService.lockDocument(projectId, adminId, docId, 'agent-session-1', ONE_MINUTE_MS);
    expect(lock).toMatchObject({ documentId: docId, owner: 'agent-session-1' });

    const locksResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents/locks`)
      .set(auth(token))
      .expect(200);
    expect(locksResponse.body).toEqual([{ documentId: docId, owner: 'agent-session-1', expiresAt: lock.expiresAt }]);

    const treeResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/tree`)
      .set(auth(token))
      .expect(200);
    const treeDoc = treeResponse.body.documents.find((d: { id: string }) => d.id === docId);
    expect(treeDoc.lockedUntil).toBe(lock.expiresAt);

    const patchResponse = await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({ name: 'renamed' })
      .expect(409);
    expect(patchResponse.body.message).toBe('Document is locked by an agent');
    expect(patchResponse.body.lockExpiresAt).toBe(lock.expiresAt);

    await request(app.getHttpServer()).delete(`/projects/${projectId}/documents/${docId}`).set(auth(token)).expect(409);
  });

  it('lockDocument by the same owner renews rather than conflicting', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);
    const adminId = await getUserId(app, token);

    const first = await documentsService.lockDocument(projectId, adminId, docId, 'agent-session-1', ONE_MINUTE_MS);
    const second = await documentsService.lockDocument(projectId, adminId, docId, 'agent-session-1', ONE_MINUTE_MS * 2);

    expect(new Date(second.expiresAt).getTime()).toBeGreaterThan(new Date(first.expiresAt).getTime());
  });

  it('lockDocument by a different owner while active throws (service level, mirrors the PATCH 409)', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);
    const adminId = await getUserId(app, token);

    await documentsService.lockDocument(projectId, adminId, docId, 'agent-session-1', ONE_MINUTE_MS);

    await expect(
      documentsService.lockDocument(projectId, adminId, docId, 'agent-session-2', ONE_MINUTE_MS),
    ).rejects.toThrow('Document is locked by an agent');
  });

  it('update() with a matching lockOwner is allowed through the lock (the MCP-host path)', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);
    const adminId = await getUserId(app, token);

    await documentsService.lockDocument(projectId, adminId, docId, 'agent-session-1', ONE_MINUTE_MS);

    const updated = await documentsService.update(
      projectId,
      adminId,
      docId,
      { name: 'agentRenamed' },
      'agent-session-1',
    );
    expect(updated.name).toBe('agentRenamed');
  });

  it('unlockDocument is a no-op when nothing is held, and rejects a different owner', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);
    const adminId = await getUserId(app, token);

    await expect(documentsService.unlockDocument(projectId, adminId, docId, 'nobody')).resolves.toBeUndefined();

    await documentsService.lockDocument(projectId, adminId, docId, 'agent-session-1', ONE_MINUTE_MS);
    await expect(documentsService.unlockDocument(projectId, adminId, docId, 'agent-session-2')).rejects.toThrow();

    await documentsService.unlockDocument(projectId, adminId, docId, 'agent-session-1');
    const locks = await documentsService.getLocks(projectId, adminId);
    expect(locks).toEqual([]);
  });

  it('POST .../lock over HTTP locks and appears in getLocks (ADR 0034 §3 — browser-agent route)', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);

    const lockResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${docId}/lock`)
      .set(auth(token))
      .send({ owner: 'tab-agent-1' })
      .expect(201);
    expect(lockResponse.body).toMatchObject({ documentId: docId, owner: 'tab-agent-1' });

    const locksResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents/locks`)
      .set(auth(token))
      .expect(200);
    expect(locksResponse.body).toEqual([
      { documentId: docId, owner: 'tab-agent-1', expiresAt: lockResponse.body.expiresAt },
    ]);
  });

  it('POST .../lock by a different owner while active 409s over HTTP too', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${docId}/lock`)
      .set(auth(token))
      .send({ owner: 'tab-agent-1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${docId}/lock`)
      .set(auth(token))
      .send({ owner: 'tab-agent-2' })
      .expect(409);
  });

  it('DELETE .../lock releases it; a different owner is rejected (403)', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${docId}/lock`)
      .set(auth(token))
      .send({ owner: 'tab-agent-1' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/projects/${projectId}/documents/${docId}/lock`)
      .set(auth(token))
      .send({ owner: 'tab-agent-2' })
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/projects/${projectId}/documents/${docId}/lock`)
      .set(auth(token))
      .send({ owner: 'tab-agent-1' })
      .expect(204);

    const locksResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents/locks`)
      .set(auth(token))
      .expect(200);
    expect(locksResponse.body).toEqual([]);
  });

  it('PATCH with a matching lockOwner in the body does not 409 against its own lock', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${docId}/lock`)
      .set(auth(token))
      .send({ owner: 'tab-agent-1' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({ name: 'renamedByOwnTab', lockOwner: 'tab-agent-1' })
      .expect(200);
  });

  it('PATCH without a lockOwner still 409s a document locked over HTTP by an agent', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);

    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents/${docId}/lock`)
      .set(auth(token))
      .send({ owner: 'tab-agent-1' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({ name: 'renamed' })
      .expect(409);
  });

  it('an expired lock is treated as absent — PATCH succeeds, no sweeper needed', async () => {
    const token = await login(app);
    const { projectId, docId } = await setUpDocument(token);
    const adminId = await getUserId(app, token);

    await documentsService.lockDocument(projectId, adminId, docId, 'agent-session-1', -ONE_MINUTE_MS);

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({ name: 'renamedAfterExpiry' })
      .expect(200);

    const locksResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents/locks`)
      .set(auth(token))
      .expect(200);
    expect(locksResponse.body).toEqual([]);
  });
});
