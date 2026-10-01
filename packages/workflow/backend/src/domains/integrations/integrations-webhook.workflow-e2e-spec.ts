import { webhookIntegration } from '@falang/workflow-integrations-webhook';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_BACKEND_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eAwaitWorkflowResult,
  workflowE2eLogin,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import { buildReturnNode, buildTriggerFunctionRootNode } from '../../test-utils/workflow-e2e-fixtures.js';

/** Import mints fresh credential ids (security audit P0-6), so the id the fixture used is not the stored one. */
const findImportedInstanceId = async (token: string, projectId: string): Promise<string> => {
  const response = await workflowE2eApi().get(`/projects/${projectId}/documents`).set(workflowE2eAuth(token));
  const integrations = (
    response.body as readonly { type: string; data?: { instances: readonly { id: string }[] } }[]
  ).find((doc) => doc.type === 'integrations');
  const id = integrations?.data?.instances[0]?.id;
  if (!id) throw new Error(`No integration instance in project ${projectId}`);
  return id;
};

/**
 * Workflow-tier port of `@falang/workflow-e2e-tests`' `integrations-webhook.spec.ts` — see
 * ADR 0018 (private). Same assertion (an inbound POST signals a real
 * fresh Temporal workflow through a real runner pod's registered webhook route, whose result echoes
 * the payload), driven entirely through `POST /projects/import` + `build` HTTP calls and a plain
 * `fetch` POST instead of the project tree/toolbar UI — no browser.
 *
 * Unlike `integrations-http`/`integrations-openai`'s workflow-tier ports, the credential doesn't
 * need a post-import `PATCH`: nothing about a credential's *id* is backend-assigned (only a
 * document's own id is, see `build-and-run.workflow-e2e-spec.ts`'s doc comment on `importProject`'s
 * id remapping), so this fixture picks `credentialId` itself and embeds it directly into both the
 * `integrations` document's seeded instance and the `trigger-function-body`'s `credentialId` field
 * up front — `importProject` merges an imported `integrations` document's `data` into the project's
 * already-auto-seeded pinned one. Only the trigger-function *document's own* id is unknown until
 * after import (needed for the webhook URL/expected workflow id), so that's still looked up by name
 * afterward, the same `findDocumentIdByName` shape `build-and-run.workflow-e2e-spec.ts` uses for its
 * cross-document `call-function` reference.
 */
describe('integrations (workflow tier): Webhook', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const findDocumentIdByName = async (projectId: string, name: string): Promise<string> => {
    const response = await workflowE2eApi().get(`/projects/${projectId}/documents`).set(workflowE2eAuth(token));
    const document = (response.body as readonly { id: string; name: string }[]).find((doc) => doc.name === name);
    if (!document) throw new Error(`No document named "${name}" in project ${projectId}`);
    return document.id;
  };

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  it('webhook-trigger: an inbound POST signals a fresh workflow, whose result echoes the payload', async () => {
    const credentialId = `cred-${Date.now()}`;
    const trigger = webhookIntegration.triggers[0];
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier Webhook ${Date.now()}` },
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
            instances: [{ id: credentialId, vendor: webhookIntegration.vendor, name: 'Local Webhook', fields: {} }],
          },
        },
        {
          id: 'trigger',
          type: 'trigger-function',
          name: 'onWebhook',
          folderId: null,
          pinned: false,
          root: buildTriggerFunctionRootNode(
            'trigger',
            {
              vendor: webhookIntegration.vendor,
              triggerName: trigger.name,
              credentialId,
              scopeVariableName: trigger.scopeVariableName,
              scopeType: trigger.scopeType,
              returnValue: { type: 'string' },
            },
            [buildReturnNode('trigger-return', 'request.body')],
          ),
          data: null,
        },
      ],
    };

    const importResponse = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(importResponse.status).toBe(201);
    const projectId = importResponse.body.id as string;

    try {
      const triggerId = await findDocumentIdByName(projectId, 'onWebhook');
      const importedCredentialId = await findImportedInstanceId(token, projectId);

      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const payload = { hello: Date.now() };
      // See `integrations-webhook.spec.ts`'s own comment: `IntegrationWebhookController.dispatch`
      // returns `{ status }` in its JSON *body* (the wrapping HTTP response is NestJS's default 201
      // for a bare `@Post`), and the route only exists once `IntegrationsRuntimeService`'s discovery
      // tick has actually registered it — retry rather than assume it's already live.
      await workflowE2eWaitForValue(async () => {
        const res = await fetch(
          `${WORKFLOW_E2E_BACKEND_URL}/webhooks/webhook/${projectId}/${importedCredentialId}/dev/${triggerId}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) return;
        const body = (await res.json()) as { status: number };
        if (body.status === 200) return body;
      }, 60_000);

      const result = await workflowE2eAwaitWorkflowResult(`webhook-${triggerId}`);
      expect(result).toBe(JSON.stringify(payload));

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 150_000);
});
