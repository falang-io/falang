import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eFetchMockItems,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import { buildActivepiecesActionNode, buildFunctionNode } from '../../test-utils/workflow-e2e-fixtures.js';

const ACTIVEPIECES_MOCK_VENDOR = 'activepieces-mock';

/**
 * Workflow-tier port of `@falang/workflow-e2e-tests`' `integrations-activepieces-mock.spec.ts` — see
 * ADR 0018 (private). Same assertion (a real `activepieces-action` node's
 * activity really stores an item in the ActivePieces mock service, via a real runner pod), driven
 * entirely through `POST /projects/import` + `build` HTTP calls — no browser. The credential is
 * embedded directly into the fixture (no post-import `PATCH` needed at all here, unlike
 * `integrations-http`/`integrations-openai`'s ports) — see
 * `integrations-webhook.workflow-e2e-spec.ts`'s doc comment for why that's safe, and this spec
 * doesn't even need the function document's own post-import id (unlike a trigger's), since
 * `workflowE2eStartAndAwaitResult` starts a workflow by *function name*, not document id.
 * Needs the real `docker-compose.workflow-e2e.yml` stack up with `activepieces` included
 * (`docker compose -f docker-compose.workflow-e2e.yml up -d --build backend activepieces`).
 */
describe('integrations (workflow tier, mock service): ActivePieces mock piece', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  it('activepieces-action create_item stores an item in the mock service', async () => {
    const credentialId = `cred-${Date.now()}`;
    const itemTitle = `E2E Mock Item ${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier Mock Item ${Date.now()}` },
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
                vendor: ACTIVEPIECES_MOCK_VENDOR,
                name: 'E2E mock account',
                fields: { workspace: 'e2e', apiKey: { dev: 'e2e-mock-api-key', prod: 'e2e-mock-api-key' } },
              },
            ],
          },
        },
        {
          id: 'fn',
          type: 'function',
          name: 'createItem',
          folderId: null,
          pinned: false,
          root: buildFunctionNode('fn', [
            buildActivepiecesActionNode('fn-action', {
              pieceName: 'mock',
              actionName: 'create_item',
              credentialId,
              propsValue: {
                title: JSON.stringify(itemTitle),
                content: JSON.stringify('Created by the ffalang workflow e2e suite.'),
              },
            }),
          ]),
          data: null,
        },
      ],
    };

    const importResponse = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(fixture);
    expect(importResponse.status).toBe(201);
    const projectId = importResponse.body.id as string;

    try {
      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await workflowE2eWaitFor(async () => {
        const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
        return (response.body as { running?: boolean }).running === true;
      }, 60_000);

      const result = await workflowE2eStartAndAwaitResult('createItem', `workflow-dev-${projectId}`);
      expect(result).toBeUndefined();

      // Verified directly against the mock service's own store — not the workflow's own result,
      // since there's no real vendor UI/API to check against (see
      // ADR 0013 (private)).
      await workflowE2eWaitFor(async () => {
        const items = await workflowE2eFetchMockItems();
        return items.some((item) => item.title === itemTitle);
      }, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 60_000);
});
