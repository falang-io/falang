import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, it } from 'vitest';
import { createTestApp } from '../../test-utils/e2e-app.js';
import { ProjectTokenService } from './project-token.service.js';

describe('POST /internal/auth/verify-project-token', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let tokens: ProjectTokenService;

  beforeEach(async () => {
    app = await createTestApp();
    tokens = app.get(ProjectTokenService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts the token minted for exactly this project', async () => {
    const token = tokens.getOrCreateToken('project-a');
    await request(app.getHttpServer())
      .post('/internal/auth/verify-project-token')
      .set('x-internal-project-token', token)
      .send({ projectId: 'project-a' })
      .expect(200, { ok: true });
  });

  it("rejects project A's token presented for project B", async () => {
    const tokenA = tokens.getOrCreateToken('project-a');
    tokens.getOrCreateToken('project-b');
    await request(app.getHttpServer())
      .post('/internal/auth/verify-project-token')
      .set('x-internal-project-token', tokenA)
      .send({ projectId: 'project-b' })
      .expect(403);
  });

  it('rejects a missing token and a missing projectId', async () => {
    const token = tokens.getOrCreateToken('project-a');
    await request(app.getHttpServer())
      .post('/internal/auth/verify-project-token')
      .send({ projectId: 'project-a' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/internal/auth/verify-project-token')
      .set('x-internal-project-token', token)
      .send({})
      .expect(403);
  });
});
