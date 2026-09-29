import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';

/** `DbAgentUsageSink` end to end: a chat call records a row, `GET /projects/:id/agent/usage` sums them. */
describe('agent usage (/projects/:id/agent/usage)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const registerUser = async (username: string): Promise<string> => {
    await request(app.getHttpServer()).post('/auth/register').send({ username, password: 'password123' });
    return login(app, username, 'password123');
  };

  const chat = (token: string, projectId: string) =>
    request(app.getHttpServer())
      .post(`/projects/${projectId}/agent/chat`)
      .set(auth(token))
      .send({ system: 's', messages: [{ role: 'user', content: 'hello' }], tools: [] });

  it('passes usage through, records each call and sums them per project', async () => {
    const adminToken = await login(app);
    const userToken = await registerUser('alice');
    const project = await request(app.getHttpServer()).post('/projects').set(auth(userToken)).send({ name: 'p' });
    const projectId = project.body.id as string;
    await request(app.getHttpServer())
      .put('/admin/settings/agent')
      .set(auth(adminToken))
      .send({ baseUrl: 'https://api.example.com', model: 'gpt-test', apiKey: 'sk' })
      .expect(200);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            choices: [{ message: { content: 'a', tool_calls: [] } }],
            usage: { completion_tokens: 3, prompt_tokens: 10, total_tokens: 13 },
          }),
        )
        .mockResolvedValueOnce(Response.json({ choices: [{ message: { content: 'b', tool_calls: [] } }] })),
    );

    const first = await chat(userToken, projectId);
    expect(first.body.usage).toEqual({ completionTokens: 3, promptTokens: 10, totalTokens: 13 });
    const second = await chat(userToken, projectId);
    expect(second.body.usage).toBeUndefined();

    const usage = await request(app.getHttpServer()).get(`/projects/${projectId}/agent/usage`).set(auth(userToken));
    expect(usage.status).toBe(200);
    expect(usage.body).toEqual({ calls: 2, completionTokens: 3, promptTokens: 10, totalTokens: 13 });
  });

  it("404s (or 403s) another user's project usage", async () => {
    const alice = await registerUser('alice');
    const bob = await registerUser('bob');
    const project = await request(app.getHttpServer()).post('/projects').set(auth(alice)).send({ name: 'p' });
    const response = await request(app.getHttpServer())
      .get(`/projects/${project.body.id as string}/agent/usage`)
      .set(auth(bob));
    expect([403, 404]).toContain(response.status);
  });
});
