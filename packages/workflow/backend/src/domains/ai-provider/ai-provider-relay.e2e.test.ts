// oxlint-disable max-lines-per-function, max-lines, max-classes-per-file, init-declarations, no-await-in-loop, unicorn/no-await-expression-member, no-undefined -- scenario-style e2e over one fake upstream.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Global, HttpException, Module, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import {
  AI_PROVIDER_USAGE_SINK,
  type IAiProviderAfterCallContext,
  type IAiProviderCallContext,
  type IAiProviderUsageSink,
} from './ai-provider-usage-sink.js';
import { DbAiProviderUsageSink } from './db-ai-provider-usage-sink.js';

interface IUpstreamCall {
  readonly url: string;
  readonly authorization: string | undefined;
  readonly body: string;
}

interface IFakeUpstream {
  readonly baseUrl: string;
  readonly calls: IUpstreamCall[];
  /** Next replies (status + JSON); default a 200 completion with usage. */
  readonly replies: { status: number; body: unknown }[];
  /** While set, requests wait until `release()` is called. */
  hold: boolean;
  release: () => void;
  close: () => Promise<void>;
}

const DEFAULT_REPLY = {
  id: 'c1',
  model: 'gpt-4o-mini-2024',
  choices: [{ message: { role: 'assistant', content: 'hi' } }],
  usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17, prompt_tokens_details: { cached_tokens: 4 } },
};

const startUpstream = async (): Promise<IFakeUpstream> => {
  const waiting: (() => void)[] = [];
  const state: IFakeUpstream = {
    baseUrl: '',
    calls: [],
    replies: [],
    hold: false,
    release: () => {
      state.hold = false;
      for (const resume of waiting.splice(0)) resume();
    },
    close: () => Promise.resolve(),
  };
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      state.calls.push({
        url: req.url ?? '',
        authorization: req.headers.authorization,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      const answer = (): void => {
        const reply = state.replies.shift() ?? { status: 200, body: DEFAULT_REPLY };
        res.writeHead(reply.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(reply.body));
      };
      if (state.hold) waiting.push(answer);
      else answer();
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return Object.assign(state, {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  });
};

/** A sink recording both hooks; `refuse` makes `beforeCall` throw it. */
class RecordingSink implements IAiProviderUsageSink {
  readonly before: IAiProviderCallContext[] = [];
  readonly after: IAiProviderAfterCallContext[] = [];
  refuse: HttpException | null = null;
  failAfter = false;

  beforeCall(ctx: IAiProviderCallContext): Promise<void> {
    this.before.push(ctx);
    return this.refuse ? Promise.reject(this.refuse) : Promise.resolve();
  }

  afterCall(ctx: IAiProviderAfterCallContext): Promise<void> {
    this.after.push(ctx);
    return this.failAfter ? Promise.reject(new Error('ledger down')) : Promise.resolve();
  }
}

const MODELS = [
  { id: 'gpt-4o-mini', kind: 'chat' },
  { id: 'dall-e-3', kind: 'image' },
];

const CRED = 'ai-1';

describe('built-in AI provider relay (ADR 0081 phase 1)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let upstream: IFakeUpstream;
  // oxlint-disable-next-line init-declarations
  let adminToken: string;
  let sink: RecordingSink | null = null;
  let projectCount = 0;

  const boot = async (withSink: boolean): Promise<void> => {
    sink = withSink ? new RecordingSink() : null;
    const recording = sink;
    @Global()
    @Module({
      providers: [{ provide: AI_PROVIDER_USAGE_SINK, useValue: recording }],
      exports: [AI_PROVIDER_USAGE_SINK],
    })
    class TestSinkModule {}
    app = await createTestApp(undefined, withSink ? [TestSinkModule] : []);
    adminToken = await login(app);
  };

  beforeEach(async () => {
    projectCount = 0;
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('BACKEND_INTERNAL_URL', 'http://backend.internal:3001/');
    vi.stubEnv('AI_PROVIDER_MAX_CONCURRENT_PER_OWNER', '1');
    upstream = await startUpstream();
  });

  afterEach(async () => {
    upstream.release();
    await app.close();
    await upstream.close();
    vi.unstubAllEnvs();
  });

  const http = () => request(app.getHttpServer());
  const configure = () =>
    http()
      .put('/admin/settings/ai-provider')
      .set(auth(adminToken))
      .send({ baseUrl: upstream.baseUrl, apiKey: 'sk-platform', models: MODELS });
  const tokenOf = (projectId: string) => app.get(ProjectTokenService).getOrCreateToken(projectId);

  const createProject = async (platformProvider = true): Promise<string> => {
    projectCount += 1;
    const created = await http()
      .post('/projects')
      .set(auth(adminToken))
      .send({ name: `p${projectCount}` });
    const projectId: string = created.body.id;
    const tree = await http().get(`/projects/${projectId}/tree`).set(auth(adminToken));
    const integrations = (tree.body.documents as { id: string; type: string }[]).find(
      (document) => document.type === 'integrations',
    );
    if (!integrations) throw new Error('expected the integrations document');
    const instance = {
      // Credential ids are unique across projects; the first project of a test uses CRED.
      id: projectCount === 1 ? CRED : `${CRED}-${projectCount}`,
      vendor: 'openai',
      name: 'AI',
      fields: platformProvider
        ? { baseUrl: '', apiKey: { dev: '', prod: '' } }
        : { baseUrl: 'https://own.example/v1', apiKey: { dev: 'sk-own', prod: '' } },
      ...(platformProvider ? { platformProvider: true } : {}),
    };
    const saved = await http()
      .patch(`/projects/${projectId}/documents/${integrations.id}`)
      .set(auth(adminToken))
      .send({ data: { instances: [instance] } });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    return projectId;
  };

  const chat = (projectId: string, body: Record<string, unknown>, env = 'dev', token = tokenOf(projectId)) =>
    http()
      .post(`/internal/ai-provider/${projectId}/${env}/chat/completions`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const chatBody = { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hello' }] };

  describe('credential resolve', () => {
    const resolve = (projectId: string, field: string, env: 'dev' | 'prod' = 'dev') =>
      http()
        .post('/internal/credentials/resolve')
        .set('x-internal-project-token', tokenOf(projectId))
        .send({ credentialId: CRED, projectId, vendor: 'openai', field, env });

    it('answers the relay URL and the project token for a platformProvider instance, in both envs', async () => {
      await boot(false);
      await configure();
      const projectId = await createProject();
      for (const env of ['dev', 'prod'] as const) {
        const baseUrl = await resolve(projectId, 'baseUrl', env);
        expect(baseUrl.status).toBe(201);
        expect(baseUrl.body).toEqual({
          value: `http://backend.internal:3001/internal/ai-provider/${projectId}/${env}`,
        });
        const apiKey = await resolve(projectId, 'apiKey', env);
        expect(apiKey.body).toEqual({ value: tokenOf(projectId) });
        expect(JSON.stringify(apiKey.body)).not.toContain('sk-platform');
      }
    });

    it('412 ai_provider_not_configured while the provider is off or BACKEND_INTERNAL_URL is unset', async () => {
      await boot(false);
      const projectId = await createProject();
      const off = await resolve(projectId, 'baseUrl');
      expect(off.status).toBe(412);
      expect(off.body).toMatchObject({ code: 'ai_provider_not_configured' });
      await configure();
      vi.stubEnv('BACKEND_INTERNAL_URL', '');
      const noUrl = await resolve(projectId, 'apiKey');
      expect(noUrl.status).toBe(412);
    });

    it('an instance without the flag still resolves its own values', async () => {
      await boot(false);
      await configure();
      const projectId = await createProject(false);
      expect((await resolve(projectId, 'baseUrl')).body).toEqual({ value: 'https://own.example/v1' });
      expect((await resolve(projectId, 'apiKey')).body).toEqual({ value: 'sk-own' });
    });
  });

  describe('field options', () => {
    it('lists the admin models of the field kind for a platformProvider instance, never the upstream', async () => {
      await boot(false);
      const projectId = await createProject();
      const options = (action: string) =>
        http()
          .get(`/projects/${projectId}/integrations/${CRED}/actions/${action}/fields/model/options`)
          .set(auth(adminToken));
      const off = await options('call-ai-text');
      expect(off.status).toBe(200);
      expect(off.body).toEqual([]);
      await configure();
      expect((await options('call-ai-text')).body).toEqual([{ value: 'gpt-4o-mini', label: 'gpt-4o-mini' }]);
      expect((await options('call-ai-choice')).body).toEqual([{ value: 'gpt-4o-mini', label: 'gpt-4o-mini' }]);
      expect((await options('call-ai-image')).body).toEqual([{ value: 'dall-e-3', label: 'dall-e-3' }]);
      expect(upstream.calls).toEqual([]);
    });
  });

  describe('chat completions', () => {
    it('forwards the body unchanged under the platform key and records usage through the sink', async () => {
      await boot(true);
      await configure();
      const projectId = await createProject();
      const response = await chat(projectId, chatBody, 'prod');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(DEFAULT_REPLY);
      expect(upstream.calls).toHaveLength(1);
      expect(upstream.calls[0]).toMatchObject({ url: '/v1/chat/completions', authorization: 'Bearer sk-platform' });
      expect(JSON.parse(upstream.calls[0]?.body ?? '')).toEqual(chatBody);
      const ownerId = (await http().get('/auth/me').set(auth(adminToken))).body.id as string;
      const ctx = { env: 'prod', kind: 'chat', model: 'gpt-4o-mini', ownerId, projectId };
      expect(sink?.before).toEqual([ctx]);
      expect(sink?.after).toEqual([
        { ...ctx, usage: { promptTokens: 12, completionTokens: 5, totalTokens: 17, cachedPromptTokens: 4 } },
      ]);
    });

    it('accepts x-internal-project-token too, and the community sink writes ai_provider_usage', async () => {
      await boot(false);
      await configure();
      const projectId = await createProject();
      const response = await http()
        .post(`/internal/ai-provider/${projectId}/dev/chat/completions`)
        .set('x-internal-project-token', tokenOf(projectId))
        .send(chatBody);
      expect(response.status).toBe(200);
      expect(await app.get(DbAiProviderUsageSink).getProjectTotals(projectId)).toEqual({
        calls: 1,
        completionTokens: 5,
        promptTokens: 12,
        totalTokens: 17,
      });
    });

    it('401 without a token, with a wrong one or another project’s, and 404 for an unknown env', async () => {
      await boot(true);
      await configure();
      const projectId = await createProject();
      const other = await createProject();
      const missing = await http().post(`/internal/ai-provider/${projectId}/dev/chat/completions`).send(chatBody);
      expect(missing.status).toBe(401);
      expect(missing.body).toMatchObject({ code: 'invalid_project_token', error: { code: 'invalid_project_token' } });
      expect((await chat(projectId, chatBody, 'dev', 'nope')).status).toBe(401);
      expect((await chat(projectId, chatBody, 'dev', tokenOf(other))).status).toBe(401);
      expect((await chat(projectId, chatBody, 'staging')).status).toBe(404);
      expect(upstream.calls).toEqual([]);
      expect(sink?.before).toEqual([]);
    });

    it('400 model_not_allowed for a model outside the chat list (an image model too), and stream refused', async () => {
      await boot(true);
      await configure();
      const projectId = await createProject();
      for (const model of ['gpt-5', 'dall-e-3', undefined]) {
        const refused = await chat(projectId, { ...chatBody, model });
        expect(refused.status).toBe(400);
        expect(refused.body).toMatchObject({ code: 'model_not_allowed', error: { code: 'model_not_allowed' } });
      }
      const streamed = await chat(projectId, { ...chatBody, stream: true });
      expect(streamed.status).toBe(400);
      expect(streamed.body.code).toBe('stream_not_supported');
      expect(upstream.calls).toEqual([]);
      expect(sink?.before).toEqual([]);
    });

    it('412 when the provider is not configured', async () => {
      await boot(true);
      const projectId = await createProject();
      const response = await chat(projectId, chatBody);
      expect(response.status).toBe(412);
      expect(response.body.code).toBe('ai_provider_not_configured');
    });

    it('passes a beforeCall refusal through as its own status and body, without calling upstream', async () => {
      await boot(true);
      await configure();
      const projectId = await createProject();
      if (!sink) throw new Error('sink');
      sink.refuse = new HttpException({ code: 'insufficient_balance', message: 'Top up' }, 402);
      const response = await chat(projectId, chatBody);
      expect(response.status).toBe(402);
      expect(response.body).toEqual({ code: 'insufficient_balance', message: 'Top up' });
      expect(upstream.calls).toEqual([]);
      expect(sink.after).toEqual([]);
    });

    it('returns an upstream error as-is without afterCall; an afterCall failure never fails the reply', async () => {
      await boot(true);
      await configure();
      const projectId = await createProject();
      if (!sink) throw new Error('sink');
      upstream.replies.push({ status: 500, body: { error: { message: 'upstream broke' } } });
      const failed = await chat(projectId, chatBody);
      expect(failed.status).toBe(500);
      expect(failed.body).toEqual({ error: { message: 'upstream broke' } });
      expect(sink.after).toEqual([]);

      sink.failAfter = true;
      upstream.replies.push({ status: 200, body: { choices: [] } });
      const ok = await chat(projectId, chatBody);
      expect(ok.status).toBe(200);
      expect(sink.after).toEqual([expect.objectContaining({ usage: null })]);
    });

    it('429 ai_provider_busy beyond the per-owner concurrency limit, and the slot is released afterwards', async () => {
      await boot(true);
      await configure();
      const projectId = await createProject();
      upstream.hold = true;
      const first = chat(projectId, chatBody).then((response) => response);
      await vi.waitFor(() => expect(upstream.calls).toHaveLength(1));
      const second = await chat(projectId, chatBody);
      expect(second.status).toBe(429);
      expect(second.body.code).toBe('ai_provider_busy');
      upstream.release();
      expect((await first).status).toBe(200);
      expect((await chat(projectId, chatBody)).status).toBe(200);
    });

    it('a 502 when the upstream cannot be reached', async () => {
      await boot(true);
      await configure();
      const projectId = await createProject();
      await upstream.close();
      const response = await chat(projectId, chatBody);
      expect(response.status).toBe(502);
      expect(response.body.code).toBe('ai_provider_unreachable');
      expect(sink?.after).toEqual([]);
    });
  });

  describe('other endpoints', () => {
    it('images/transcriptions are 400 not_supported_by_built_in_provider; models lists chat models', async () => {
      await boot(true);
      await configure();
      const projectId = await createProject();
      const token = tokenOf(projectId);
      for (const path of ['images/generations', 'audio/transcriptions']) {
        const response = await http()
          .post(`/internal/ai-provider/${projectId}/dev/${path}`)
          .set('Authorization', `Bearer ${token}`)
          .send({ model: 'dall-e-3', prompt: 'x' });
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          code: 'not_supported_by_built_in_provider',
          error: { code: 'not_supported_by_built_in_provider' },
        });
      }
      const models = await http()
        .get(`/internal/ai-provider/${projectId}/dev/models`)
        .set('Authorization', `Bearer ${token}`);
      expect(models.status).toBe(200);
      expect(models.body).toEqual({
        object: 'list',
        data: [{ id: 'gpt-4o-mini', object: 'model', owned_by: 'falang' }],
      });
      const anonymous = await http().get(`/internal/ai-provider/${projectId}/dev/models`);
      expect(anonymous.status).toBe(401);
      expect(upstream.calls).toEqual([]);
    });
  });
});
