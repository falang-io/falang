import http from 'node:http';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { getTelegramCalls, pushTelegramUpdate } from '@falang/workflow-mocks';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_MOCKS_URL,
  WORKFLOW_E2E_PROXY_STATS_URL,
  WORKFLOW_E2E_PROXY_TOKEN,
  WORKFLOW_E2E_PROXY_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import { buildTelegramSendMessageNode, buildTriggerFunctionRootNode } from '../../test-utils/workflow-e2e-fixtures.js';

/**
 * ADR 0056 (private): the egress proxy really carries the traffic of a selected vendor. Telegram is selected
 * in the admin settings; the proxy's own `GET /__stats` (connections per `host:port`) is the observable. Two
 * distinct targets show up because `backend` and a runner pod reach the Telegram mock by different addresses
 * (`mocks:4100` on the compose network vs `<gateway>:4102` from inside `kind`).
 */

/** `GET /__stats` of the proxy — `node:http` because fetch forbids the `Proxy-Authorization` header. */
const readProxyStats = (): Promise<Record<string, number>> =>
  new Promise((resolve, reject) => {
    const req = http.get(
      `${WORKFLOW_E2E_PROXY_STATS_URL}/__stats`,
      { headers: { 'Proxy-Authorization': `Bearer ${WORKFLOW_E2E_PROXY_TOKEN}` } },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`proxy /__stats answered ${res.statusCode}: ${body}`));
            return;
          }
          resolve((JSON.parse(body) as { connections: Record<string, number> }).connections);
        });
      },
    );
    req.on('error', reject);
  });

const sumFor = (stats: Record<string, number>, predicate: (target: string) => boolean): number =>
  Object.entries(stats)
    .filter(([target]) => predicate(target))
    .reduce((total, [, count]) => total + count, 0);

const isBackendTarget = (target: string): boolean => target.endsWith(':4100');
const isPodTarget = (target: string): boolean => target.endsWith(':4102');

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('egress proxy (workflow tier)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  afterAll(async () => {
    // Platform-global settings: never leave the proxy configured for the other specs.
    await workflowE2eApi().delete('/admin/settings/proxy').set(workflowE2eAuth(token));
  });

  const runTelegramEcho = async (label: string): Promise<void> => {
    const botToken = `e2e-proxy-${label}-${Date.now()}`;
    const credentialId = `cred-${Date.now()}`;
    const trigger = telegramIntegration.triggers[0];
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier egress proxy ${label} ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'integrations',
          type: 'integrations',
          name: 'Integrations',
          folderId: null,
          pinned: true,
          root: null,
          data: {
            instances: [
              {
                id: credentialId,
                vendor: telegramIntegration.vendor,
                name: 'Mock Bot',
                fields: { botToken: { dev: botToken, prod: botToken } },
              },
            ],
          },
        },
        {
          id: 'trigger',
          type: 'trigger-function',
          name: 'onMessage',
          folderId: null,
          pinned: false,
          root: buildTriggerFunctionRootNode(
            'trigger',
            {
              vendor: telegramIntegration.vendor,
              triggerName: trigger.name,
              credentialId,
              scopeVariableName: trigger.scopeVariableName,
              scopeType: trigger.scopeType,
            },
            [
              buildTelegramSendMessageNode('trigger-send', {
                credentialId,
                chatId: 'message.chat.id',
                text: 'Echo: ${message.text}',
              }),
            ],
          ),
          data: null,
        },
      ],
    };
    const imported = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(imported.status).toBe(201);
    const projectId = imported.body.id as string;
    try {
      const build = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(build.status).toBe(202);
      await workflowE2eWaitFor(async () => {
        const status = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
        return (status.body as { running?: boolean }).running === true;
      }, 90_000);

      await pushTelegramUpdate(WORKFLOW_E2E_MOCKS_URL, botToken, {
        message: {
          message_id: 100,
          date: Math.floor(Date.now() / 1000),
          chat: { id: 555, type: 'private' },
          text: 'hi bot',
        },
      });
      const sendMessage = await workflowE2eWaitForValue(async () => {
        const calls = await getTelegramCalls(WORKFLOW_E2E_MOCKS_URL, botToken);
        return calls.find((call) => call.method === 'sendMessage');
      }, 60_000);
      expect(sendMessage.body).toEqual({ chat_id: 555, text: 'Echo: hi bot' });

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await workflowE2eWaitFor(async () => {
        const status = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
        return (status.body as { running?: boolean }).running === false;
      }, 30_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  };

  it('Telegram traffic of backend and of the runner pod goes through the proxy when selected', async () => {
    const put = await workflowE2eApi()
      .put('/admin/settings/proxy')
      .set(workflowE2eAuth(token))
      .send({ url: WORKFLOW_E2E_PROXY_URL, token: WORKFLOW_E2E_PROXY_TOKEN, vendors: ['telegram'] });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ configured: true, vendors: ['telegram'], hasToken: true });

    const before = await readProxyStats();
    await runTelegramEcho('on');
    const after = await readProxyStats();

    // Backend ingress (long polling `getUpdates`, target `mocks:4100`) and the pod's `sendMessage`
    // (target `<gateway>:4102`) are different `host:port` strings.
    expect(sumFor(after, isBackendTarget)).toBeGreaterThan(sumFor(before, isBackendTarget));
    expect(sumFor(after, isPodTarget)).toBeGreaterThan(sumFor(before, isPodTarget));
  }, 240_000);

  it('after the settings are removed no new connection goes through the proxy', async () => {
    await workflowE2eApi().delete('/admin/settings/proxy').set(workflowE2eAuth(token)).expect(204);
    // Let in-flight proxied traffic (a long poll started under the old config) drain.
    await delay(5000);
    const before = await readProxyStats();
    await runTelegramEcho('off');
    const after = await readProxyStats();
    // Only the backend side is deterministic: `DELETE` refreshes its in-memory copy at once, while an already
    // running runner pod keeps the previous config until its next 30 s poll (covered by the poller's unit tests).
    expect(sumFor(after, isBackendTarget)).toBe(sumFor(before, isBackendTarget));
  }, 240_000);
});
