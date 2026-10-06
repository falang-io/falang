import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';

/** `POST /projects/:id/agent/check-project` end to end (real build worker): ADR 0062 (private). */
describe('agent check-project', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let token: string;
  // oxlint-disable-next-line init-declarations
  let projectId: string;
  // oxlint-disable-next-line init-declarations
  let documentId: string;

  // oxlint-disable-next-line consistent-function-scoping -- test fixture builder.
  const functionTree = (id: string, assign: string): INode => ({
    id,
    name: 'function',
    children: [
      { id: `${id}-header`, name: 'function-header', data: '' },
      {
        id: `${id}-body`,
        name: 'function-body',
        data: { parameters: [] },
        children: [
          {
            id: `${id}-var`,
            name: 'create-var',
            data: { name: 'total', variableType: { type: 'number', numberType: { type: 'any' } } },
          },
          { id: `${id}-act`, name: 'action', data: assign },
        ],
      },
      { id: `${id}-footer`, name: 'function-footer', data: '' },
    ],
  });
  const CLEAN = 'total = 1';
  const BAD = "total = 'oops'";

  const check = (body: unknown, userToken = token, id = projectId) =>
    request(app.getHttpServer()).post(`/projects/${id}/agent/check-project`).set(auth(userToken)).send(body as object);

  beforeEach(async () => {
    app = await createTestApp();
    token = await login(app);
    const project = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    projectId = project.body.id as string;
    documentId = randomUUID();
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id: documentId, type: 'function', name: 'run', root: functionTree(documentId, CLEAN) })
      .expect(201);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns no diagnostics for a clean project', async () => {
    const response = await check({ documents: [] });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ diagnostics: [] });
  });

  it('maps a type error to its document and node', async () => {
    const stored = randomUUID();
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id: stored, type: 'function', name: 'broken', root: functionTree(stored, BAD) })
      .expect(201);
    const response = await check({ documents: [] });
    expect(response.status).toBe(200);
    expect(response.body.diagnostics).toEqual([
      expect.objectContaining({ documentId: stored, nodeId: `${stored}-act` }),
    ]);
  });

  it('uses the overlay over the stored tree, in both directions', async () => {
    const broken = await check({ documents: [{ id: documentId, root: functionTree(documentId, BAD) }] });
    expect(broken.body.diagnostics).toEqual([
      expect.objectContaining({ documentId, nodeId: `${documentId}-act` }),
    ]);

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${documentId}`)
      .set(auth(token))
      .send({ root: functionTree(documentId, BAD) })
      .expect(200);
    const fixed = await check({ documents: [{ id: documentId, root: functionTree(documentId, CLEAN) }] });
    expect(fixed.body).toEqual({ diagnostics: [] });
  });

  it('reports an overlay that is not a valid tree as a diagnostic of that document', async () => {
    const response = await check({ documents: [{ id: documentId, root: { id: 'x', name: 'nonsense' } }] });
    expect(response.status).toBe(200);
    expect(response.body.diagnostics[0]).toMatchObject({ documentId });
  });

  it("refuses another user's project", async () => {
    await request(app.getHttpServer()).post('/auth/register').send({ username: 'bob', password: 'password123' });
    const bob = await login(app, 'bob', 'password123');
    const response = await check({ documents: [] }, bob);
    expect([403, 404]).toContain(response.status);
  });

  it('422s on a document id that is not in the project', async () => {
    const unknown = randomUUID();
    const response = await check({ documents: [{ id: unknown, root: functionTree(unknown, CLEAN) }] });
    expect(response.status).toBe(422);
    expect(JSON.stringify(response.body)).toContain(unknown);
  });
});
