// oxlint-disable no-promise-executor-return, no-undefined -- test harness.
// oxlint-disable max-lines-per-function -- a scenario harness: one fake messenger and the app wiring around it.
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import {
  INTEGRATIONS_DOCUMENT_TYPE,
  type ISandboxBotAdapter,
  type ISandboxIngressContext,
  type IWorkflowIntegration,
} from '@falang/workflow-integrations-common';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/auth/jwt-auth.guard.js';
import { MAIL_TRANSPORT } from '../mail/mail.service.js';
import { FILE_STORAGE } from '../files/file-storage.js';
import { InMemoryFileStorage } from '../files/in-memory-file-storage.js';
import { Document } from '../projects/documents/document.entity.js';
import { CapturingMailTransport } from '../../test-utils/capturing-mail-transport.js';
import { auth, buildTestAppImports, login } from '../../test-utils/e2e-app.js';
import { SANDBOX_INTEGRATIONS } from './sandbox-integrations.js';

export interface IFakeUpdate {
  chat: string;
  private?: boolean;
  payload?: string;
  text?: string;
  title?: string;
}

export interface IUpstreamCall {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** A fake messenger plus a local "vendor API" server the relay forwards to. */
export const createFakeMessenger = async () => {
  const sent: { token: string; chatId: string; text: string }[] = [];
  /** Every `chatCommands.set` call, in order. */
  const menus: { token: string; chatId: string; commands: { command: string; description: string }[] }[] = [];
  const upstreamCalls: IUpstreamCall[] = [];
  const state: {
    ingress?: ISandboxIngressContext;
    disposed: number;
    /** Makes `chatCommands.set` reject. */
    menuFails?: boolean;
    upstreamStatus: number;
    /** Headers the adapter saw in its last `inspect`. */
    inspectHeaders?: Headers;
    /** What `sentMessages` reports for a `sendMessage` call; the default is one message `m-<n>` in the first recipient. */
    sentOverride?: { messageId: string; chatId: string }[];
  } = {
    disposed: 0,
    upstreamStatus: 200,
  };
  let sentCounter = 0;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      upstreamCalls.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      res.writeHead(state.upstreamStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: state.upstreamStatus < 400, result: 'from-upstream' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const upstreamBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const adapter: ISandboxBotAdapter = {
    tokenField: 'botToken',
    startIngress: (ctx) => {
      state.ingress = ctx;
      return Promise.resolve(() => {
        state.disposed += 1;
        return Promise.resolve();
      });
    },
    describeUpdate: (update) => {
      const u = update as IFakeUpdate;
      if (typeof u.chat !== 'string') return null;
      return {
        chatId: u.chat,
        isPrivateChat: u.private !== false,
        startPayload: u.payload ?? null,
        text: u.text ?? null,
        chatTitle: u.title ?? null,
      };
    },
    sendText: (token, chatId, text) => {
      sent.push({ token, chatId, text });
      return Promise.resolve();
    },
    getBotInfo: (token) => {
      if (token === 'bad-token') return Promise.reject(new Error('Unauthorized'));
      return Promise.resolve({ username: 'fake_bot', title: 'Fake Bot' });
    },
    buildChatLink: (info, payload) => `https://fake.example/${info.username}?start=${payload}`,
    // The fake lists one command per trigger-function document of the project: its name.
    chatCommands: {
      list: (documents) => documents.map((doc) => ({ command: doc.name, description: `Run ${doc.name}` })),
      set: (token, chatId, commands) => {
        menus.push({ token, chatId, commands: [...commands] });
        return state.menuFails ? Promise.reject(new Error('menu failed')) : Promise.resolve();
      },
    },
    relay: {
      inspect: async (req, path) => {
        state.inspectHeaders = new Headers(req.headers);
        const match = /^\/bot([^/]+)\/(\w+)/.exec(path);
        if (!match) return { error: 'unrecognised path' };
        const relayToken = match[1] ?? '';
        const method = match[2] ?? '';
        const body = (await req.json()) as { chat_id?: string | number; message_id?: string };
        if (method === 'sendMessage') {
          return { method, recipients: [String(body.chat_id)], relayToken, sendsMessage: true };
        }
        // Id-only edit (MAX `PUT /messages`), an upload (nothing addressed), and two malformed decisions.
        if (method === 'editMessage')
          return { method, recipients: [], messageIds: [String(body.message_id)], relayToken };
        if (method === 'upload') return { method, recipients: [], unaddressed: true, relayToken };
        if (method === 'nothing') return { method, recipients: [], relayToken };
        if (method === 'mixed') {
          return { method, recipients: [String(body.chat_id)], unaddressed: true, relayToken };
        }
        return { error: `method ${method} is not allowed` };
      },
      sentMessages: (call) => {
        if (call.method !== 'sendMessage') return [];
        sentCounter += 1;
        return state.sentOverride ?? [{ messageId: `m-${sentCounter}`, chatId: call.recipients[0] ?? '' }];
      },
      upstreamUrl: (token, path, search) => `${upstreamBase}${path.replace(/^\/bot[^/]+/, `/bot${token}`)}${search}`,
      upstreamHeaders: (token) => ({ 'x-real-token': token }),
      // A 403 on a send is "the bot can't reach the chat", like Telegram's `bot was blocked by the user`.
      isChatUnreachable: (call, status) => call.method === 'sendMessage' && status === 403,
    },
  };

  const integration: IWorkflowIntegration = {
    vendor: 'fakegram',
    label: 'Fakegram',
    notes: 'Test messenger.',
    credentialFields: [{ name: 'botToken', label: 'Bot token', kind: 'secret' }],
    triggers: [],
    actions: [],
    sandbox: adapter,
  };
  return { adapter, integration, sent, menus, upstreamCalls, state, close: () => server.close() };
};

export type TFakeMessenger = Awaited<ReturnType<typeof createFakeMessenger>>;

export const createSandboxApp = async (integration: IWorkflowIntegration): Promise<INestApplication> => {
  process.env.SELF_SERVICE_SIGNUP ??= 'true';
  process.env.SEED_DEFAULT_ADMIN ??= 'true';
  const moduleRef = await Test.createTestingModule({
    imports: buildTestAppImports(),
    providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
  })
    .overrideProvider(FILE_STORAGE)
    .useValue(new InMemoryFileStorage())
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(new CapturingMailTransport())
    .overrideProvider(SANDBOX_INTEGRATIONS)
    .useValue([integration])
    .compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
};

export const registerUser = async (app: INestApplication, username: string): Promise<string> => {
  await request(app.getHttpServer()).post('/auth/register').send({ username, password: 'password123' });
  return login(app, username, 'password123');
};

/** A project of `token`'s user with one fakegram instance written straight into its integrations document. */
export const createProjectWithInstance = async (
  app: INestApplication,
  token: string,
  instance: { id: string; devSandbox?: boolean },
): Promise<string> => {
  const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'Bot project' });
  const projectId = (created.body as { id: string }).id;
  const documents = app.get<Repository<Document>>(getRepositoryToken(Document));
  const doc = await documents.findOneByOrFail({ projectId, type: INTEGRATIONS_DOCUMENT_TYPE });
  doc.data = {
    instances: [
      {
        id: instance.id,
        vendor: 'fakegram',
        name: 'Fake',
        fields: { botToken: { dev: '', prod: '' } },
        ...(instance.devSandbox === undefined ? {} : { devSandbox: instance.devSandbox }),
      },
    ],
  };
  await documents.save(doc);
  return projectId;
};

/** Adds a `trigger-function` document named `name` to the project (the fake adapter turns it into a menu command). */
export const addTriggerDocument = async (app: INestApplication, projectId: string, name: string): Promise<void> => {
  const documents = app.get<Repository<Document>>(getRepositoryToken(Document));
  await documents.save(
    documents.create({
      id: randomUUID(),
      type: 'trigger-function',
      name,
      projectId,
      folderId: null,
      pinned: false,
      root: null,
      data: null,
    }),
  );
};
