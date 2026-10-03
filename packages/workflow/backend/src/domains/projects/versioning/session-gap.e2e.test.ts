import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { Project } from '../projects/project.entity.js';

const FN_1 = '11111111-1111-4111-8111-111111111111';
const FN_2 = '22222222-2222-4222-8222-222222222222';
const FOLDER_1 = 'f0000000-0000-4000-8000-000000000000';

/**
 * `SessionGapAutoVersionInterceptor` (ADR 0025 (private)'s "Correction to
 * decision 2 (2026-09-18)") — the receiving-side session-gap rule that replaced the old client-side
 * `AutoCommitScheduler`. See `versioning.e2e.test.ts` for the rest of `VersioningService`'s own
 * coverage; this file is specifically about *when* the interceptor fires.
 */
describe('session-gap auto-versions (e2e)', () => {
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

  const createProject = async (token: string, name: string): Promise<string> => {
    const response = await request(server()).post('/projects').set(auth(token)).send({ name });
    return response.body.id as string;
  };

  const createFunctionDocument = (token: string, projectId: string, id: string, name: string) =>
    request(server())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id, type: 'function', name, folderId: null, root: { id, name: 'function', children: [] } });

  const listCommits = async (token: string, projectId: string): Promise<{ id: string; kind: string }[]> => {
    const response = await request(server()).get(`/projects/${projectId}/commits`).set(auth(token));
    return response.body;
  };

  it('(a) a first PATCH/POST on a fresh project with content but no HEAD auto-commits the pre-edit state', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'Fresh');

    const created = await createFunctionDocument(token, projectId, FN_1, 'run');
    expect(created.status).toBe(201);

    const commits = await listCommits(token, projectId);
    expect(commits).toHaveLength(1);
    expect(commits[0].kind).toBe('auto');

    // The auto-commit snapshots the state *before* this write — the seeded integrations document
    // only, not the function document the request itself was about to create.
    const snapshot = await request(server()).get(`/projects/${projectId}/commits/${commits[0].id}`).set(auth(token));
    expect(snapshot.body.documents.map((doc: { id: string }) => doc.id)).not.toContain(FN_1);
    expect(snapshot.body.documents).toHaveLength(1);
  });

  it('(b) a second write right after the first does not create another auto commit', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'Fresh two writes');

    await createFunctionDocument(token, projectId, FN_1, 'run').expect(201);
    await createFunctionDocument(token, projectId, FN_2, 'run2').expect(201);

    const commits = await listCommits(token, projectId);
    expect(commits).toHaveLength(1);
  });

  it('(c) a write after a real 4h gap (last_edited_at set directly) auto-commits the pre-edit state and refreshes last_edited_at', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'Gap project');
    // First-ever-edit auto commit.
    await createFunctionDocument(token, projectId, FN_1, 'run').expect(201);

    const projects: Repository<Project> = app.get(getRepositoryToken(Project));
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    await projects.update({ id: projectId }, { lastEditedAt: fourHoursAgo });

    const before = await listCommits(token, projectId);
    expect(before).toHaveLength(1);

    await createFunctionDocument(token, projectId, FN_2, 'run2').expect(201);

    const after = await listCommits(token, projectId);
    expect(after).toHaveLength(2);
    // Newest first; the new auto commit's snapshot is the pre-edit state (still without FN_2).
    const newSnapshot = await request(server()).get(`/projects/${projectId}/commits/${after[0].id}`).set(auth(token));
    const newSnapshotIds: string[] = newSnapshot.body.documents.map((doc: { id: string }) => doc.id);
    expect(newSnapshotIds).not.toContain(FN_2);
    expect(newSnapshotIds).toContain(FN_1);

    const project = await projects.findOneBy({ id: projectId });
    expect(project?.lastEditedAt?.getTime()).toBeGreaterThan(fourHoursAgo.getTime());
  });

  it('(d) a named commit at session end plus a 4h gap produces no auto commit on the next edit (clean vs HEAD)', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'Clean session end');
    // First-ever-edit auto commit.
    await createFunctionDocument(token, projectId, FN_1, 'run').expect(201);

    // The user names the current state at the end of the session — HEAD now equals the working copy.
    await request(server())
      .post(`/projects/${projectId}/commits`)
      .set(auth(token))
      .send({ kind: 'named', message: 'End of session' })
      .expect(200);

    const projects: Repository<Project> = app.get(getRepositoryToken(Project));
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    await projects.update({ id: projectId }, { lastEditedAt: fourHoursAgo });

    const commitsBefore = await listCommits(token, projectId);
    const beforeCount = commitsBefore.length;

    // A gap has elapsed, but nothing changed since the named commit — the working copy is clean
    // against HEAD, so `commit()`'s own dirtiness check makes the auto-version a no-op even though
    // the session-gap rule itself says "try".
    await createFunctionDocument(token, projectId, FN_2, 'run2').expect(201);

    const commitsAfter = await listCommits(token, projectId);
    const afterCount = commitsAfter.length;
    expect(afterCount).toBe(beforeCount);
  });

  it('(e) folder routes trigger the same rule', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'Folder project');

    const tree = await request(server()).get(`/projects/${projectId}/tree`).set(auth(token));
    const functionsSection = tree.body.folders.find((f: { fixedKind: string }) => f.fixedKind === 'functions').id;
    const created = await request(server())
      .post(`/projects/${projectId}/folders`)
      .set(auth(token))
      .send({ id: FOLDER_1, name: 'My folder', parentId: functionsSection });
    expect(created.status).toBe(201);

    const commits = await listCommits(token, projectId);
    expect(commits).toHaveLength(1);
    expect(commits[0].kind).toBe('auto');
  });

  it('(f) GET routes and POST /commits do not trigger an auto commit', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'Read-only routes');

    await request(server()).get(`/projects/${projectId}/documents`).set(auth(token)).expect(200);
    await request(server()).get(`/projects/${projectId}/tree`).set(auth(token)).expect(200);
    await request(server())
      .post(`/projects/${projectId}/commits`)
      .set(auth(token))
      .send({ kind: 'named', message: 'Explicit only' })
      .expect(200);

    const projects: Repository<Project> = app.get(getRepositoryToken(Project));
    const project = await projects.findOneBy({ id: projectId });
    expect(project?.lastEditedAt).toBeNull();

    // The explicit named commit above is the only commit — no auto commit was ever attempted.
    const commits = await listCommits(token, projectId);
    expect(commits).toHaveLength(1);
    expect(commits[0].kind).toBe('named');
  });
});
