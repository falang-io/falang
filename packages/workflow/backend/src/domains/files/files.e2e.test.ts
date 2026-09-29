import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserLimitsService } from '../admin/user-limits/user-limits.service.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../internal-auth/project-token.guard.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { auth, createTestApp } from '../../test-utils/e2e-app.js';

/**
 * Real-HTTP coverage of `FilesModule`'s three controllers over the in-memory sqlite harness (see
 * `test-utils/e2e-app.ts`, `InMemoryFileStorage` swapped in for `FILE_STORAGE`) — see
 * ADR 0038 (private) and the fixed phase-2 contract. Exercises the
 * internal API (`ProjectTokenGuard`), the public capability-URL route, and the project/JWT API
 * together, since they all share one `files` row per upload.
 */
describe('files (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('BACKEND_PUBLIC_URL', 'http://backend.test');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const loginAdmin = async (): Promise<{ token: string; userId: string }> => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin' });
    return { token: response.body.accessToken as string, userId: response.body.user.id as string };
  };

  const createProject = async (token: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'files-test' });
    return response.body.id as string;
  };

  const internalToken = (projectId: string): string => app.get(ProjectTokenService).getOrCreateToken(projectId);

  const internalUpload = (
    projectId: string,
    projectToken: string,
    body: Buffer | string,
    opts: { name: string; mime: string; ttlSeconds?: number; createdBy?: string; workflowEnv?: string },
  ) => {
    let req = request(app.getHttpServer())
      .post(`/internal/files/${projectId}`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken)
      .set('content-type', opts.mime)
      .set('x-file-name', encodeURIComponent(opts.name));
    if (typeof opts.ttlSeconds === 'number') req = req.set('x-file-ttl-seconds', String(opts.ttlSeconds));
    if (opts.createdBy) req = req.set('x-created-by', opts.createdBy);
    if (opts.workflowEnv) req = req.set('x-workflow-env', opts.workflowEnv);
    return req.send(body);
  };

  it('supports the full upload → publish → download → unpublish → delete lifecycle', async () => {
    const { token } = await loginAdmin();
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);
    const bytes = Buffer.from('hello, files!');

    const uploaded = await internalUpload(projectId, projectToken, bytes, { name: 'hello.txt', mime: 'text/plain' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body).toEqual({ id: expect.any(String), name: 'hello.txt', size: bytes.length, mime: 'text/plain' });
    const fileId: string = uploaded.body.id;

    const meta = await request(app.getHttpServer())
      .get(`/internal/files/${projectId}/${fileId}/meta`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken);
    expect(meta.status).toBe(200);
    expect(meta.body).toEqual(uploaded.body);

    // Not published yet — nothing to fetch publicly under any token.
    const beforePublish = await request(app.getHttpServer()).get('/files/p/not-a-real-token');
    expect(beforePublish.status).toBe(404);

    const published = await request(app.getHttpServer())
      .post(`/internal/files/${projectId}/${fileId}/publish`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken);
    expect(published.status).toBe(200);
    expect(typeof published.body.publicUrl).toBe('string');
    const publicToken = String(published.body.publicUrl).split('/').pop();

    const rePublished = await request(app.getHttpServer())
      .post(`/internal/files/${projectId}/${fileId}/publish`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken);
    expect(rePublished.body.publicUrl).toBe(published.body.publicUrl);

    const publicDownload = await request(app.getHttpServer()).get(`/files/p/${publicToken}`);
    expect(publicDownload.status).toBe(200);
    expect(publicDownload.headers['content-type']).toBe('text/plain');
    expect(publicDownload.text).toBe('hello, files!');

    const unpublished = await request(app.getHttpServer())
      .delete(`/internal/files/${projectId}/${fileId}/publish`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken);
    expect(unpublished.status).toBe(200);
    expect(unpublished.body.publicUrl).toBeUndefined();

    const afterUnpublish = await request(app.getHttpServer()).get(`/files/p/${publicToken}`);
    expect(afterUnpublish.status).toBe(404);

    const list = await request(app.getHttpServer()).get(`/projects/${projectId}/files`).set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.files).toHaveLength(1);
    expect(list.body.files[0]).toMatchObject({ id: fileId, name: 'hello.txt', size: bytes.length, createdBy: 'run:unknown' });
    expect(list.body.usage.usedBytes).toBe(bytes.length);
    expect(list.body.usage.maxFileBytes).toBeGreaterThan(0);
    expect(list.body.usage.maxProjectFilesBytes).toBeGreaterThan(0);

    const deleted = await request(app.getHttpServer())
      .delete(`/internal/files/${projectId}/${fileId}`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({});

    const afterDelete = await request(app.getHttpServer())
      .get(`/internal/files/${projectId}/${fileId}/meta`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken);
    expect(afterDelete.status).toBe(404);
  });

  it("404s a project's file when accessed through a different project's token", async () => {
    const { token } = await loginAdmin();
    const projectA = await createProject(token);
    const projectB = await createProject(token);
    const tokenA = internalToken(projectA);
    const tokenB = internalToken(projectB);

    const uploaded = await internalUpload(projectA, tokenA, Buffer.from('secret'), { name: 's.txt', mime: 'text/plain' });
    const fileId: string = uploaded.body.id;

    const crossAccess = await request(app.getHttpServer())
      .get(`/internal/files/${projectB}/${fileId}`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, tokenB);
    expect(crossAccess.status).toBe(404);
  });

  it('rejects an upload over the per-file limit with 413, leaving nothing behind', async () => {
    const { token, userId } = await loginAdmin();
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);
    await app.get(UserLimitsService).setOverrides(userId, { maxFileBytes: 5 });

    const response = await internalUpload(projectId, projectToken, Buffer.from('this is way over five bytes'), {
      name: 'too-big.bin',
      mime: 'application/octet-stream',
    });

    expect(response.status).toBe(413);
    const list = await request(app.getHttpServer()).get(`/projects/${projectId}/files`).set(auth(token));
    expect(list.body.files).toHaveLength(0);
  });

  it('reads the raw bytes through even when the file itself is application/json (body-parser already consumed the request)', async () => {
    const { token } = await loginAdmin();
    const projectId = await createProject(token);
    const projectToken = internalToken(projectId);
    const jsonText = JSON.stringify({ hello: 'world' });
    // A plain *string* body here, not a `Buffer` — superagent's own `_end()` re-`JSON.stringify`s
    // any non-string body whenever the request's content-type is `application/json` (it has no
    // special case for a `Buffer` there, only in `.send()`'s own assignment step), which would
    // silently corrupt this specific test's body into `'{"type":"Buffer","data":[...]}'` — a real
    // gotcha hit writing this test, unrelated to the actual server-side behavior being verified.
    const jsonBytes = Buffer.from(jsonText);

    const uploaded = await internalUpload(projectId, projectToken, jsonText, {
      name: 'data.json',
      mime: 'application/json',
    });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.size).toBe(jsonBytes.length);

    const download = await request(app.getHttpServer())
      .get(`/internal/files/${projectId}/${uploaded.body.id}`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, projectToken);
    expect(download.status).toBe(200);
    expect(JSON.parse(download.text)).toEqual({ hello: 'world' });
  });

  it('manual project upload (JWT) records the uploading user as createdBy', async () => {
    const { token, userId } = await loginAdmin();
    const projectId = await createProject(token);

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/files`)
      .set(auth(token))
      .set('content-type', 'text/plain')
      .set('x-file-name', 'note.txt')
      .send(Buffer.from('a note'));

    expect(response.status).toBe(201);
    expect(response.body.createdBy).toBe(`user:${userId}`);

    const download = await request(app.getHttpServer())
      .get(`/projects/${projectId}/files/${response.body.id}`)
      .set(auth(token));
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.text).toBe('a note');
  });
});
