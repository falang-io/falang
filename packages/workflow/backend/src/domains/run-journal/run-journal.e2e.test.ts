// oxlint-disable unicorn/no-await-expression-member, unicorn/consistent-function-scoping, typescript-eslint/consistent-type-imports -- supertest chains read best inline in tests.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../internal-auth/project-token.guard.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { RunJournalGcService } from './run-journal-gc.service.js';

describe('run journal (e2e)', () => {
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

  const http = () => request(app.getHttpServer());
  const createProject = async (token: string): Promise<string> => {
    const response = await http().post('/projects').set(auth(token)).send({ name: 'journal' });
    return response.body.id as string;
  };
  const tokenFor = (projectId: string): string => app.get(ProjectTokenService).getOrCreateToken(projectId);
  const ingest = (projectId: string, body: unknown, token = tokenFor(projectId)) =>
    http()
      .post(`/internal/projects/${projectId}/run-journal`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, token)
      .send(body as object);

  const makeEntry = (n: number, overrides: Record<string, unknown> = {}) => ({
    workflowId: 'wf-1',
    runId: 'run-1',
    sourceKey: `run-1:w:${n}`,
    kind: 'log',
    level: 'info',
    message: `message ${n}`,
    data: { n },
    documentId: 'doc',
    nodeId: `node-${n}`,
    vendor: null,
    ts: 1_759_740_000_000 + n * 1000,
    ...overrides,
  });

  const listRun = (projectId: string, token: string, query = '') =>
    http().get(`/projects/${projectId}/runs/wf-1/run-1/journal${query}`).set(auth(token));

  it('ingests a batch (204), is idempotent on a repeated batch, and lists it in order', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    const body = { env: 'dev', buildId: 'b1', entries: [makeEntry(2), makeEntry(1)] };

    await ingest(projectId, body).expect(204);
    await ingest(projectId, body).expect(204);

    const response = await listRun(projectId, adminToken).expect(200);
    expect(response.body.hasMore).toBe(false);
    const entries = response.body.entries as { message: string; env: string; ts: string; id: string; data: unknown }[];
    // The API returns insertion (id) order; clients sort for display.
    expect(entries.map((entry) => entry.message)).toEqual(['message 2', 'message 1']);
    expect(entries[1]).toMatchObject({
      workflowId: 'wf-1',
      runId: 'run-1',
      env: 'dev',
      kind: 'log',
      level: 'info',
      data: { n: 1 },
      documentId: 'doc',
      nodeId: 'node-1',
      vendor: null,
      truncated: false,
      textsStripped: false,
    });
    expect(typeof entries[1]?.id).toBe('string');
    expect(entries[1]?.ts).toBe(new Date(1_759_740_001_000).toISOString());
  });

  it('pages by insertion id: entries whose ts order differs from id order are never skipped', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    // Inserted 1..5 but with descending timestamps (a late flush of an older workflow entry looks exactly like this).
    const entries = [1, 2, 3, 4, 5].map((n) => makeEntry(n, { ts: 1_759_740_000_000 - n * 1000 }));
    await ingest(projectId, { env: 'dev', entries: entries.slice(0, 3) }).expect(204);
    await ingest(projectId, { env: 'dev', entries: entries.slice(3) }).expect(204);

    const seen: string[] = [];
    let after = '';
    for (let page = 0; page < 10; page += 1) {
      const query = `?limit=2${after ? `&after=${after}` : ''}`;
      // oxlint-disable-next-line no-await-in-loop -- pages are sequential (each cursor comes from the previous page).
      const body = (await listRun(projectId, adminToken, query).expect(200)).body as {
        entries: { id: string; message: string }[];
        hasMore: boolean;
      };
      seen.push(...body.entries.map((entry) => entry.message));
      after = body.entries.at(-1)?.id ?? after;
      if (!body.hasMore) break;
    }
    expect(seen).toEqual(['message 1', 'message 2', 'message 3', 'message 4', 'message 5']);
  });

  it('falls back to the receive time for an unusable ts', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    await ingest(projectId, { env: 'dev', entries: [makeEntry(1, { ts: '2025-10-06T10:00:00Z' })] }).expect(204);
    const [entry] = (await listRun(projectId, adminToken).expect(200)).body.entries as { ts: string }[];
    expect(Math.abs(Date.now() - new Date(entry?.ts ?? 0).getTime())).toBeLessThan(60_000);
  });

  it('rejects a wrong or missing project token and a foreign project token', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    const other = await createProject(adminToken);
    const body = { env: 'dev', entries: [makeEntry(1)] };

    expect((await ingest(projectId, body, 'nope')).status).toBe(403);
    expect((await http().post(`/internal/projects/${projectId}/run-journal`).send(body)).status).toBe(403);
    expect((await ingest(projectId, body, tokenFor(other))).status).toBe(403);
    const response = await listRun(projectId, adminToken).expect(200);
    expect(response.body.entries).toEqual([]);
  });

  it('validates the body (bad enum, too many entries)', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    expect((await ingest(projectId, { env: 'dev', entries: [makeEntry(1, { kind: 'nope' })] })).status).toBe(400);
    expect((await ingest(projectId, { env: 'staging', entries: [] })).status).toBe(400);
    const many = Array.from({ length: 501 }, (_value, index) => makeEntry(index));
    expect((await ingest(projectId, { env: 'dev', entries: many })).status).toBe(400);
  });

  it('strips texts when the project switches them off, and only for later entries', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    await ingest(projectId, { env: 'prod', entries: [makeEntry(1)] }).expect(204);

    const settings = await http().get(`/projects/${projectId}/journal-settings`).set(auth(adminToken)).expect(200);
    expect(settings.body).toEqual({ storeTexts: true });
    const put = await http()
      .put(`/projects/${projectId}/journal-settings`)
      .set(auth(adminToken))
      .send({ storeTexts: false })
      .expect(200);
    expect(put.body).toEqual({ storeTexts: false });

    await ingest(projectId, {
      env: 'prod',
      entries: [
        makeEntry(2, {
          kind: 'ai',
          message: 'tell me a secret',
          vendor: 'openai',
          data: {
            prompt: 'tell me a secret',
            model: 'gpt-x',
            usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          },
        }),
      ],
    }).expect(204);

    const entries = (await listRun(projectId, adminToken).expect(200)).body.entries as {
      message: string;
      textsStripped: boolean;
      data: unknown;
      vendor: string | null;
      env: string;
    }[];
    expect(entries[0]?.message).toBe('message 1');
    expect(entries[0]?.textsStripped).toBe(false);
    expect(entries[1]?.textsStripped).toBe(true);
    expect(entries[1]?.vendor).toBe('openai');
    expect(entries[1]?.env).toBe('prod');
    expect(JSON.stringify(entries[1])).not.toContain('secret');
    expect(entries[1]?.data).toEqual({
      promptLength: 16,
      model: 'gpt-x',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
  });

  it('pages with after/limit and reports hasMore', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    await ingest(projectId, { env: 'dev', entries: [1, 2, 3, 4, 5].map((n) => makeEntry(n)) }).expect(204);

    const first = (await listRun(projectId, adminToken, '?limit=2').expect(200)).body as {
      entries: { id: string; message: string }[];
      hasMore: boolean;
    };
    expect(first.entries.map((entry) => entry.message)).toEqual(['message 1', 'message 2']);
    expect(first.hasMore).toBe(true);

    const cursor = first.entries.at(-1)?.id ?? '';
    const second = (await listRun(projectId, adminToken, `?after=${cursor}&limit=10`).expect(200)).body as {
      entries: { message: string }[];
      hasMore: boolean;
    };
    expect(second.entries.map((entry) => entry.message)).toEqual(['message 3', 'message 4', 'message 5']);
    expect(second.hasMore).toBe(false);

    expect((await listRun(projectId, adminToken, '?limit=5000')).status).toBe(400);
    expect((await listRun(projectId, adminToken, '?after=abc')).status).toBe(400);
  });

  it('lists a whole workflow across runs including runId = null entries, and nothing of another workflow', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    await ingest(projectId, {
      env: 'prod',
      entries: [
        makeEntry(1),
        makeEntry(2, { runId: 'run-2', sourceKey: 'run-2:w:1', message: 'second run' }),
        makeEntry(3, { runId: null, sourceKey: 'b:abc', kind: 'error', level: 'warn', message: 'undeliverable' }),
        makeEntry(4, { workflowId: 'wf-other', sourceKey: 'x:w:1', message: 'other workflow' }),
      ],
    }).expect(204);

    const response = await http()
      .get(`/projects/${projectId}/workflows/wf-1/journal`)
      .set(auth(adminToken))
      .expect(200);
    const entries = response.body.entries as { message: string; runId: string | null }[];
    expect(entries.map((entry) => entry.message)).toEqual(['message 1', 'second run', 'undeliverable']);
    expect(entries.map((entry) => entry.runId)).toEqual(['run-1', 'run-2', null]);
    // the per-run route does not return runId = null entries
    expect(((await listRun(projectId, adminToken)).body.entries as unknown[]).length).toBe(1);
  });

  it("hides another user's project journal and settings", async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    await ingest(projectId, { env: 'dev', entries: [makeEntry(1)] }).expect(204);
    await http().post('/auth/register').send({ username: 'bob', password: 'password123' });
    const bob = await login(app, 'bob', 'password123');

    expect([403, 404]).toContain((await listRun(projectId, bob)).status);
    expect([403, 404]).toContain(
      (await http().get(`/projects/${projectId}/workflows/wf-1/journal`).set(auth(bob))).status,
    );
    expect([403, 404]).toContain((await http().get(`/projects/${projectId}/journal-settings`).set(auth(bob))).status);
    expect([403, 404]).toContain(
      (await http().put(`/projects/${projectId}/journal-settings`).set(auth(bob)).send({ storeTexts: false })).status,
    );
  });

  it('retention sweep deletes old entries per env and keeps recent ones', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    const now = Date.now();
    const day = 86_400_000;
    await ingest(projectId, {
      env: 'dev',
      entries: [
        makeEntry(1, { ts: now - 20 * day, message: 'old dev' }),
        makeEntry(2, { ts: now - day, message: 'fresh dev' }),
      ],
    }).expect(204);
    await ingest(projectId, {
      env: 'prod',
      workflowId: 'wf-1',
      entries: [makeEntry(3, { ts: now - 20 * day, message: 'old prod' })],
    }).expect(204);
    vi.stubEnv('RUN_JOURNAL_RETENTION_DAYS_PROD', '30');

    const removed = await app.get(RunJournalGcService).sweep(new Date(now));
    expect(removed).toBe(1);
    const entries = (await listRun(projectId, adminToken)).body.entries as { message: string }[];
    expect(entries.map((entry) => entry.message)).toEqual(['fresh dev', 'old prod']);
  });

  it('deleting the project removes its entries', async () => {
    const adminToken = await login(app);
    const projectId = await createProject(adminToken);
    await ingest(projectId, { env: 'dev', entries: [makeEntry(1)] }).expect(204);
    const { RUN_JOURNAL_STORE } = await import('./run-journal-store.js');
    const store = app.get<import('./run-journal-store.js').IRunJournalStore>(RUN_JOURNAL_STORE);
    expect((await store.listWorkflow(projectId, 'wf-1', { limit: 10 })).entries).toHaveLength(1);

    await store.deleteProject(projectId);
    expect((await store.listWorkflow(projectId, 'wf-1', { limit: 10 })).entries).toHaveLength(0);
  });
});
