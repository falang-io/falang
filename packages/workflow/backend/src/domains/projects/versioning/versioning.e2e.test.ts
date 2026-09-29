import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SECRET_MASK } from '@falang/workflow-integrations-common';
import type { Repository } from 'typeorm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../../users/users/users.service.js';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { ProjectBlob } from './project-blob.entity.js';

const FN_1 = '11111111-1111-4111-8111-111111111111';
const FN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FN_KEEP = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const FN_NEW = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('versioning (e2e)', () => {
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

  const createProject = async (
    token: string,
    name: string,
  ): Promise<{ projectId: string; integrationsDocId: string }> => {
    const createResponse = await request(server()).post('/projects').set(auth(token)).send({ name });
    const projectId: string = createResponse.body.id;
    const tree = await request(server()).get(`/projects/${projectId}/tree`).set(auth(token));
    const integrationsDocId: string = tree.body.documents[0].id;
    return { projectId, integrationsDocId };
  };

  const createFunctionDocument = async (token: string, projectId: string, id: string, name: string) => {
    await request(server())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id, type: 'function', name, folderId: null, root: { id, name: 'function', children: [] } })
      .expect(201);
  };

  const commit = (token: string, projectId: string, body: { kind: 'auto' | 'named'; message: string }) =>
    request(server()).post(`/projects/${projectId}/commits`).set(auth(token)).send(body);

  it('creates a commit for a fresh project (just the seeded integrations document)', async () => {
    const token = await login(app);
    const { projectId } = await createProject(token, 'Fresh project');

    const response = await commit(token, projectId, { kind: 'named', message: 'Initial' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ kind: 'named', message: 'Initial', parentId: null, author: 'admin' });
    expect(response.body.id).toEqual(expect.any(String));
  });

  it('returns null (and creates no new commit) when nothing changed since HEAD', async () => {
    const token = await login(app);
    const { projectId } = await createProject(token, 'Idempotent project');
    await commit(token, projectId, { kind: 'named', message: 'Initial' }).expect(200);

    const second = await commit(token, projectId, { kind: 'named', message: 'Nothing changed' });
    // Nest's default reply handling treats a `null` return value the same as `undefined` (both are
    // `isNil`): it ends the response with an empty body rather than sending the literal JSON text
    // "null" — the wire-visible signal for "no new commit" is an empty 200, not a JSON `null`. See
    // this ADR's "Implementation notes (package C)" for what a client (package D) needs to do
    // instead of `await response.json()` here.
    expect(second.status).toBe(200);
    expect(second.text).toBe('');

    const list = await request(server()).get(`/projects/${projectId}/commits`).set(auth(token));
    expect(list.body).toHaveLength(1);
  });

  it('lists commits newest first with their kind, after editing a document between two commits', async () => {
    const token = await login(app);
    const { projectId } = await createProject(token, 'History project');
    await commit(token, projectId, { kind: 'named', message: 'Initial' }).expect(200);

    await createFunctionDocument(token, projectId, FN_1, 'run');
    const second = await commit(token, projectId, { kind: 'auto', message: 'Auto-save' });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ kind: 'auto' });

    const list = await request(server()).get(`/projects/${projectId}/commits`).set(auth(token));
    expect(list.body).toHaveLength(2);
    expect(list.body.map((entry: { message: string }) => entry.message)).toEqual(['Auto-save', 'Initial']);
    expect(list.body[0].parentId).toBe(list.body[1].id);
  });

  it('round-trips a document root through getSnapshot', async () => {
    const token = await login(app);
    const { projectId } = await createProject(token, 'Snapshot project');
    await createFunctionDocument(token, projectId, FN_1, 'run');
    const created = await commit(token, projectId, { kind: 'named', message: 'With a function' });
    expect(created.status).toBe(200);

    const snapshot = await request(server()).get(`/projects/${projectId}/commits/${created.body.id}`).set(auth(token));
    expect(snapshot.status).toBe(200);
    const functionDoc = snapshot.body.documents.find((doc: { id: string }) => doc.id === FN_1);
    expect(functionDoc).toMatchObject({
      type: 'function',
      name: 'run',
      root: { id: FN_1, name: 'function', children: [] },
    });
  });

  it('reuses an unchanged document blob across commits — dedupe grows the blob count by exactly one', async () => {
    const token = await login(app);
    const { projectId } = await createProject(token, 'Dedupe project');
    await createFunctionDocument(token, projectId, FN_A, 'a');
    await createFunctionDocument(token, projectId, FN_B, 'b');
    await commit(token, projectId, { kind: 'named', message: 'Both functions' }).expect(200);

    const blobs: Repository<ProjectBlob> = app.get(getRepositoryToken(ProjectBlob));
    const countAfterFirst = await blobs.count({ where: { projectId } });

    // A real content change (a different `root`, not just a rename — a rename alone changes the
    // commit's tree, which every document entry always carries, but not the document's own blob,
    // content-addressed by `{ root, data }` alone) is needed to actually produce a new blob.
    await request(server())
      .patch(`/projects/${projectId}/documents/${FN_A}`)
      .set(auth(token))
      .send({ root: { id: FN_A, name: 'function', children: [{ id: 'fn-a-log', name: 'log', data: 'hello' }] } })
      .expect(200);
    await commit(token, projectId, { kind: 'named', message: 'Changed a' }).expect(200);

    const countAfterSecond = await blobs.count({ where: { projectId } });
    expect(countAfterSecond).toBe(countAfterFirst + 1);
  });

  it('promotes an auto commit to named via nameCommit', async () => {
    const token = await login(app);
    const { projectId } = await createProject(token, 'Rename project');
    const created = await commit(token, projectId, { kind: 'auto', message: 'Auto-save 12:00' });
    expect(created.body.kind).toBe('auto');

    const named = await request(server())
      .patch(`/projects/${projectId}/commits/${created.body.id}`)
      .set(auth(token))
      .send({ message: 'A real checkpoint' });

    expect(named.status).toBe(200);
    expect(named.body).toMatchObject({ id: created.body.id, kind: 'named', message: 'A real checkpoint' });
  });

  it('404s every route for a project owned by someone else', async () => {
    const token = await login(app);
    const { projectId } = await createProject(token, 'Private project');
    const created = await commit(token, projectId, { kind: 'named', message: 'Initial' });

    const usersService = app.get(UsersService);
    await usersService.create({ username: 'someone-else', password: 'password' });
    const otherToken = await login(app, 'someone-else', 'password');

    await request(server()).get(`/projects/${projectId}/commits`).set(auth(otherToken)).expect(404);
    await request(server()).get(`/projects/${projectId}/commits/${created.body.id}`).set(auth(otherToken)).expect(404);
    await commit(otherToken, projectId, { kind: 'named', message: 'Hijack' }).expect(404);
    await request(server())
      .post(`/projects/${projectId}/commits/${created.body.id}/restore`)
      .set(auth(otherToken))
      .expect(404);
  });

  it('blanks integration secrets in a snapshot, the same way export does', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await createProject(token, 'Secret project');
    await request(server())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            { id: 'cred-1', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev: 'raw-token', prod: '' } } },
          ],
        },
      })
      .expect(200);

    const created = await commit(token, projectId, { kind: 'named', message: 'With a secret' });
    expect(created.status).toBe(200);

    const snapshot = await request(server()).get(`/projects/${projectId}/commits/${created.body.id}`).set(auth(token));
    const integrationsDoc = snapshot.body.documents.find((doc: { type: string }) => doc.type === 'integrations');
    expect(integrationsDoc.data.instances[0].fields.botToken).toEqual({ dev: '', prod: '' });
    expect(JSON.stringify(snapshot.body)).not.toContain('raw-token');
  });

  describe('restore', () => {
    it('recreates a deleted document, deletes one added after the commit, and merges the integrations document rather than overwriting it', async () => {
      const token = await login(app);
      const { projectId, integrationsDocId } = await createProject(token, 'Restore project');

      await request(server())
        .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
        .set(auth(token))
        .send({
          data: {
            instances: [
              {
                id: 'cred-1',
                vendor: 'telegram',
                name: 'Original Bot',
                fields: { botToken: { dev: 'raw-token-1', prod: '' } },
              },
            ],
          },
        })
        .expect(200);
      await createFunctionDocument(token, projectId, FN_KEEP, 'keep');
      const original = await commit(token, projectId, { kind: 'named', message: 'Before changes' });
      expect(original.status).toBe(200);

      // Delete the document that was part of the commit, add a new one that wasn't, and rename the
      // integration instance while keeping its secret (echoing SECRET_MASK, the normal client
      // convention — see `credentials-codec.ts`) — then commit *that* too, so `HEAD` moves past the
      // commit being restored to. Without this second commit, restoring back to `original` would
      // simply reproduce the still-current `HEAD` (nothing since committed), and the "restore
      // auto-commits" step being tested wouldn't have any real diff to commit.
      await request(server()).delete(`/projects/${projectId}/documents/${FN_KEEP}`).set(auth(token)).expect(204);
      await createFunctionDocument(token, projectId, FN_NEW, 'newDoc');
      await request(server())
        .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
        .set(auth(token))
        .send({
          data: {
            instances: [
              {
                id: 'cred-1',
                vendor: 'telegram',
                name: 'Renamed Bot',
                fields: { botToken: { dev: SECRET_MASK, prod: '' } },
              },
            ],
          },
        })
        .expect(200);
      const afterChanges = await commit(token, projectId, { kind: 'named', message: 'After changes' });
      expect(afterChanges.status).toBe(200);

      const restoreResponse = await request(server())
        .post(`/projects/${projectId}/commits/${original.body.id}/restore`)
        .set(auth(token));
      expect(restoreResponse.status).toBe(200);
      expect(restoreResponse.body).toMatchObject({ kind: 'named' });
      expect(restoreResponse.body.message).toContain('Before changes');

      const documents = await request(server()).get(`/projects/${projectId}/documents`).set(auth(token));
      const ids: string[] = documents.body.map((doc: { id: string }) => doc.id);
      expect(ids).toContain(FN_KEEP);
      expect(ids).not.toContain(FN_NEW);

      const integrationsDoc = documents.body.find((doc: { type: string }) => doc.type === 'integrations');
      // The name is restored from the older commit's snapshot ...
      expect(integrationsDoc.data.instances[0].name).toBe('Original Bot');
      // ... but the secret is the *currently stored* one, not the (always-blanked) snapshot value —
      // if restore had overwritten `data` straight from the snapshot instead of merging, this would
      // read `''` instead of the mask.
      expect(integrationsDoc.data.instances[0].fields.botToken).toEqual({ dev: SECRET_MASK, prod: '' });

      // Restoring created its own new commit on top, appended (never rewriting) history. Four
      // commits, not three: the very first HTTP write in this test (the `PATCH` on the integrations
      // document, right after `createProject`) is itself the project's first edit ever with no
      // `HEAD` yet, so `SessionGapAutoVersionInterceptor` auto-commits the pre-edit (freshly-seeded)
      // state ahead of "Before changes" — see ADR 0025 (private)'s "Correction
      // to decision 2 (2026-09-18)", consequence (d).
      const list = await request(server()).get(`/projects/${projectId}/commits`).set(auth(token));
      expect(list.body).toHaveLength(4);
      expect(list.body[0].id).toBe(restoreResponse.body.id);
    });
  });
});
