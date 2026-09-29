// oxlint-disable max-lines -- one file covering the whole `/mcp` HTTP surface (auth, tools/list,
// get_node_kinds, create/set_document validation, locking across two tokens, project scoping) per
// the ADR phase F brief; splitting by scenario would duplicate the harness/PAT-creation setup in
// each part with no real gain in readability.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, login } from '../../test-utils/e2e-app.js';
import { createMcpTestApp, type IMcpTestApp } from './mcp-test-harness.js';

/**
 * The one text content block every tool here returns (see `mcp-tool-result.ts`'s `okResult`/
 * `errorResult`) — `callTool()`'s own return type is a wide union covering the SDK's task-based
 * execution shape too, so this takes just the bit every real (non-task) result shares.
 */
const toolText = (result: unknown): string =>
  ((result as { content?: readonly unknown[] }).content?.[0] as { text?: string } | undefined)?.text ?? '';

const createPat = async (harness: IMcpTestApp, jwt: string, projectId?: string): Promise<string> => {
  const response = await request(harness.app.getHttpServer())
    .post('/auth/tokens')
    .set(auth(jwt))
    .send({ name: 'mcp test token', ...(projectId ? { projectId } : {}) })
    .expect(201);
  return (response.body as { rawToken: string }).rawToken;
};

const connectClient = async (harness: IMcpTestApp, rawToken?: string): Promise<Client> => {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(harness.url), {
    requestInit: rawToken ? { headers: { Authorization: `Bearer ${rawToken}` } } : {},
  });
  await client.connect(transport);
  return client;
};

describe('/mcp (HTTP-level, PAT auth) (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let harness: IMcpTestApp;
  // oxlint-disable-next-line init-declarations
  let jwt: string;
  // oxlint-disable-next-line init-declarations
  let projectId: string;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    harness = await createMcpTestApp();
    jwt = await login(harness.app);
    const projectResponse = await request(harness.app.getHttpServer())
      .post('/projects')
      .set(auth(jwt))
      .send({ name: 'MCP test project' })
      .expect(201);
    projectId = (projectResponse.body as { id: string }).id;
  });

  afterEach(async () => {
    await harness.close();
    vi.unstubAllEnvs();
  });

  it('rejects a POST with no Authorization header (plain fetch, not the SDK client which would retry/hang on 401)', async () => {
    const response = await fetch(harness.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      }),
    });
    expect(response.status).toBe(401);
  });

  it('rejects a POST authenticated with a JWT instead of a PAT', async () => {
    const response = await fetch(harness.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(response.status).toBe(401);
  });

  it('answers 405 on GET and DELETE — stateless mode never issues a session to resume/terminate', async () => {
    const rawToken = await createPat(harness, jwt);
    const getResponse = await fetch(harness.url, { headers: { Authorization: `Bearer ${rawToken}` } });
    expect(getResponse.status).toBe(405);
    const deleteResponse = await fetch(harness.url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${rawToken}` },
    });
    expect(deleteResponse.status).toBe(405);
  });

  it('lists every tool name (shared + workflow-only) via a real PAT', async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((tool) => tool.name).toSorted();
      expect(names).toEqual(
        [
          'get_project',
          'list_documents',
          'get_document',
          'get_node_kinds',
          'create_document',
          'set_document',
          'rename_document',
          'move_document',
          'delete_document',
          'create_folder',
          'lock_document',
          'unlock_document',
          'list_projects',
          'create_project',
          'import_project',
          'export_project',
          'list_functions',
          'build',
          'get_build_status',
          'get_code',
          'start_dev_run',
          'get_run_position',
          'stop',
          'list_runs',
          'get_run_history',
          'publish',
          'list_versions',
          'activate_version',
          'stop_version',
          'debug_start',
          'debug_state',
          'debug_set_breakpoints',
          'debug_resume',
          'debug_stop',
          'list_credentials',
          'list_integrations',
        ].toSorted(),
      );
    } finally {
      await client.close();
    }
  });

  it('get_node_kinds returns the function document type catalog, including the layered activepieces-action node', async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const result = await client.callTool({
        name: 'get_node_kinds',
        arguments: { projectId, documentType: 'function' },
      });
      expect(result.isError).not.toBe(true);
      const kinds = (JSON.parse(toolText(result)) as { nodeKinds: { name: string }[] }).nodeKinds;
      expect(kinds.map((kind) => kind.name)).toContain('activepieces-action');
      expect(kinds.map((kind) => kind.name)).toContain('function');
    } finally {
      await client.close();
    }
  });

  // Regression test for a real bug: `list_integrations` used to expose only `{nodeKind, label}` for
  // each trigger (`label` itself an unresolved i18n key for vendors like Telegram, e.g.
  // "telegram:trigger.onCommand"), giving an agent no way to learn that a bot command should be its
  // own `telegram-on-command-trigger` trigger-function rather than string-matched inside the catch-all
  // `telegram-trigger` — found from a real in-app-agent chat that did exactly that (see
  // ADR 0034 (private)'s matching "Found and fixed" section) and fixed here too, since this tool
  // shares the same `ITriggerDescriptor.notes`/`contextFields` with the in-app agent's own catalog.
  it("list_integrations surfaces telegram's on-command trigger's notes/contextFields, not just its bare label", async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const result = await client.callTool({ name: 'list_integrations', arguments: { keywords: ['telegram'] } });
      expect(result.isError).not.toBe(true);
      const integrations = (
        JSON.parse(toolText(result)) as {
          vendors: {
            vendor: string;
            triggers: { nodeKind: string; notes: string; contextFields?: { name: string }[] }[];
          }[];
        }
      ).vendors;
      const telegram = integrations.find((integration) => integration.vendor === 'telegram');
      const onMessage = telegram?.triggers.find((trigger) => trigger.nodeKind === 'telegram-trigger');
      const onCommand = telegram?.triggers.find((trigger) => trigger.nodeKind === 'telegram-on-command-trigger');
      expect(onMessage?.notes).toContain('telegram-on-command-trigger');
      expect(onCommand?.notes).toContain('one trigger-function document per command');
      expect(onCommand?.contextFields?.map((field) => field.name)).toEqual(['command']);

      // `notes` is a required field on `ITriggerDescriptor` precisely so every trigger in this catalog
      // has one, not just Telegram's — and `label` (UI-only, sometimes an untranslated i18n key) is
      // never sent to an agent at all.
      const allTriggers = integrations.flatMap((integration) => integration.triggers);
      expect(allTriggers.length).toBeGreaterThan(0);
      for (const trigger of allTriggers) {
        expect(trigger).not.toHaveProperty('label');
        expect(typeof trigger.notes).toBe('string');
        expect(trigger.notes.length).toBeGreaterThan(0);
      }
    } finally {
      await client.close();
    }
  });

  // ADR 0034 (private)'s 2026-09-28 follow-up: action/field/question labels used to reach the agent as raw
  // i18n keys (`telegram:action.sendMessage`) — now resolved through the vendor's own English locale.
  it('list_integrations resolves i18n-key labels to English text', async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const result = await client.callTool({ name: 'list_integrations', arguments: { keywords: ['telegram'] } });
      expect(result.isError).not.toBe(true);
      const telegram = (
        JSON.parse(toolText(result)) as {
          vendors: {
            vendor: string;
            actions: { label: string; fields: { name: string; label: string }[] }[];
            questions: { label: string }[];
          }[];
        }
      ).vendors.find((vendor) => vendor.vendor === 'telegram');
      expect(telegram?.actions[0]?.label).toBe('Send message');
      expect(telegram?.actions[0]?.fields.find((field) => field.name === 'text')?.label).toBe('Text');
      expect(telegram?.questions[0]?.label).toBe('Ask question');
    } finally {
      await client.close();
    }
  });

  // ADR 0034 (private)'s 2026-09-27 "token budget" follow-up: `list_integrations` is a keyword search
  // over vendor `notes` (shared with the in-app agent's `search_integrations`), not a dump of every
  // vendor's full catalog.
  it('list_integrations without keywords returns a compact vendor + notes index', async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const result = await client.callTool({ name: 'list_integrations', arguments: {} });
      expect(result.isError).not.toBe(true);
      const { vendors } = JSON.parse(toolText(result)) as { vendors: Record<string, unknown>[] };
      expect(vendors.length).toBeGreaterThan(10);
      for (const vendor of vendors) {
        expect(Object.keys(vendor).toSorted()).toEqual(['notes', 'vendor']);
        expect(typeof vendor.notes).toBe('string');
      }
      expect(vendors.map((vendor) => vendor.vendor)).toContain('telegram');
    } finally {
      await client.close();
    }
  });

  it('list_integrations matches keywords against vendor notes and ranks by keywords matched', async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const result = await client.callTool({ name: 'list_integrations', arguments: { keywords: ['llm', 'openai'] } });
      const { vendors } = JSON.parse(toolText(result)) as {
        vendors: { vendor: string; notes: string; actions: { nodeKind: string; fields: unknown[] }[] }[];
      };
      expect(vendors[0]?.vendor).toBe('openai');
      expect(vendors[0]?.actions.length).toBeGreaterThan(0);
      expect(vendors[0]?.actions[0]?.fields.length).toBeGreaterThan(0);

      const none = await client.callTool({ name: 'list_integrations', arguments: { keywords: ['zzqqxx'] } });
      const noMatch = JSON.parse(toolText(none)) as { vendors: unknown[]; note?: string };
      expect(noMatch.vendors).toEqual([]);
      expect(noMatch.note).toContain('http-request');
    } finally {
      await client.close();
    }
  });

  // Guards the exact class of bug a real agent chat once hit: an LLM-driven `create_document` call
  // with a non-English/non-camelCase name, which `@falang/workflow-compiler` would otherwise compile
  // verbatim into an invalid TS function identifier. Enforced in `DocumentsService.create` (this
  // MCP tool's own call into it), not in `@falang/mcp-core` — see that service's own comment.
  it('create_document rejects a "function" name that is not a camelCase English identifier', async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const result = await client.callTool({
        name: 'create_document',
        arguments: { projectId, name: 'Мой бот', type: 'function' },
      });
      expect(result.isError).toBe(true);
      expect(toolText(result)).toContain('camelCase');

      const listed = await client.callTool({ name: 'list_documents', arguments: { projectId } });
      const documents = (JSON.parse(toolText(listed)) as { documents: { name: string }[] }).documents;
      expect(documents.some((doc) => doc.name === 'Мой бот')).toBe(false);
    } finally {
      await client.close();
    }
  });

  it('create_document then set_document with an invalid root bounces back a zod path error without changing the document', async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const created = await client.callTool({
        name: 'create_document',
        arguments: { projectId, name: 'fn1', type: 'function' },
      });
      expect(created.isError).not.toBe(true);
      const document = JSON.parse(toolText(created)) as { id: string };

      const invalidSet = await client.callTool({
        name: 'set_document',
        arguments: {
          projectId,
          documentId: document.id,
          root: { id: 'x', name: 'not-a-real-node-kind', children: [] },
        },
      });
      expect(invalidSet.isError).toBe(true);
      const errorText = toolText(invalidSet);
      expect(errorText.length).toBeGreaterThan(0);
    } finally {
      await client.close();
    }
  });

  it('set_document with a valid root succeeds, persists, and holds the lock as "pat:<tokenId>"', async () => {
    const rawToken = await createPat(harness, jwt);
    const client = await connectClient(harness, rawToken);
    try {
      const created = await client.callTool({
        name: 'create_document',
        arguments: { projectId, name: 'fn2', type: 'function' },
      });
      const document = JSON.parse(toolText(created)) as {
        id: string;
        root: { id: string; name: string; children: unknown[] };
      };

      const setResult = await client.callTool({
        name: 'set_document',
        arguments: { projectId, documentId: document.id, root: document.root },
      });
      expect(setResult.isError).not.toBe(true);

      const listResult = await client.callTool({ name: 'list_documents', arguments: { projectId } });
      const listed = JSON.parse(toolText(listResult)) as {
        documents: { id: string; lock?: { ownedByMe: boolean } }[];
      };
      const lockedDoc = listed.documents.find((entry) => entry.id === document.id);
      expect(lockedDoc?.lock?.ownedByMe).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('set_document from a second token is rejected with a locked error while the first token holds the lock', async () => {
    const rawToken1 = await createPat(harness, jwt);
    const rawToken2 = await createPat(harness, jwt);
    const client1 = await connectClient(harness, rawToken1);
    const client2 = await connectClient(harness, rawToken2);
    try {
      const created = await client1.callTool({
        name: 'create_document',
        arguments: { projectId, name: 'fn3', type: 'function' },
      });
      const document = JSON.parse(toolText(created)) as {
        id: string;
        root: unknown;
      };

      const first = await client1.callTool({
        name: 'set_document',
        arguments: { projectId, documentId: document.id, root: document.root },
      });
      expect(first.isError).not.toBe(true);

      const second = await client2.callTool({
        name: 'set_document',
        arguments: { projectId, documentId: document.id, root: document.root },
      });
      expect(second.isError).toBe(true);
      expect(toolText(second)).toMatch(/locked/i);
    } finally {
      await client1.close();
      await client2.close();
    }
  });

  it('unlock_document releases the lock so a second token can then set_document', async () => {
    const rawToken1 = await createPat(harness, jwt);
    const rawToken2 = await createPat(harness, jwt);
    const client1 = await connectClient(harness, rawToken1);
    const client2 = await connectClient(harness, rawToken2);
    try {
      const created = await client1.callTool({
        name: 'create_document',
        arguments: { projectId, name: 'fn4', type: 'function' },
      });
      const document = JSON.parse(toolText(created)) as {
        id: string;
        root: unknown;
      };

      await client1.callTool({
        name: 'set_document',
        arguments: { projectId, documentId: document.id, root: document.root },
      });
      const unlocked = await client1.callTool({
        name: 'unlock_document',
        arguments: { projectId, documentId: document.id },
      });
      expect(unlocked.isError).not.toBe(true);

      const second = await client2.callTool({
        name: 'set_document',
        arguments: { projectId, documentId: document.id, root: document.root },
      });
      expect(second.isError).not.toBe(true);
    } finally {
      await client1.close();
      await client2.close();
    }
  });

  it('a project-scoped token gets a 403-shaped tool error when addressing a different project', async () => {
    const otherProjectResponse = await request(harness.app.getHttpServer())
      .post('/projects')
      .set(auth(jwt))
      .send({ name: 'Other project' })
      .expect(201);
    const otherProjectId = (otherProjectResponse.body as { id: string }).id;

    const rawToken = await createPat(harness, jwt, projectId);
    const client = await connectClient(harness, rawToken);
    try {
      const result = await client.callTool({ name: 'list_documents', arguments: { projectId: otherProjectId } });
      expect(result.isError).toBe(true);
      expect(toolText(result)).toMatch(/scoped to a different project/);

      const ownScope = await client.callTool({ name: 'list_documents', arguments: { projectId } });
      expect(ownScope.isError).not.toBe(true);
    } finally {
      await client.close();
    }
  });
});
