import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eCreateMockItem,
  workflowE2eFetchMockItems,
  workflowE2eLogin,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import { buildActivepiecesActionNode, buildTriggerFunctionRootNode } from '../../test-utils/workflow-e2e-fixtures.js';

const ACTIVEPIECES_MOCK_VENDOR = 'activepieces-mock';
/** See `@falang/workflow-integrations-activepieces`'s `activepiecesTriggerNameFor` — the qualified name `ITriggerDescriptor.name`/`signalName` actually use, not the piece's bare `new_item`. */
const MOCK_NEW_ITEM_TRIGGER_NAME = 'mock-new_item';

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Workflow-tier port of `@falang/workflow-e2e-tests`' `integrations-activepieces-mock-trigger.spec.ts`
 * — see ADR 0018 (private). Same assertion (a real ActivePieces polling
 * trigger fires a real Temporal workflow through a real runner pod, which really calls back out to
 * the mock service), driven entirely through `POST /projects/import` + `build` HTTP calls — no
 * browser, no two-step "create document then PATCH root" workaround the browser-tier spec needs
 * (`NewTriggerModal` has no UI path for ActivePieces triggers yet — irrelevant here, since import
 * accepts a fully-formed `trigger-function` root directly). Doesn't need the trigger document's own
 * post-import id either — the assertion is against the mock service's own store, not a Temporal
 * handle by workflow id. Needs the real `docker-compose.workflow-e2e.yml` stack up with
 * `activepieces` included.
 */
describe('integrations (workflow tier, mock service): ActivePieces mock trigger', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  it('new_item polling trigger fires a workflow that stores a reaction item', async () => {
    const credentialId = `cred-${Date.now()}`;
    const reactionTitle = `E2E Mock Reaction ${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier Mock Trigger ${Date.now()}` },
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
          id: 'trigger',
          type: 'trigger-function',
          name: 'onNewItem',
          folderId: null,
          pinned: false,
          root: buildTriggerFunctionRootNode(
            'trigger',
            {
              vendor: ACTIVEPIECES_MOCK_VENDOR,
              triggerName: MOCK_NEW_ITEM_TRIGGER_NAME,
              credentialId,
              scopeVariableName: 'item',
              scopeType: { type: 'any' },
            },
            [
              buildActivepiecesActionNode('trigger-action', {
                pieceName: 'mock',
                actionName: 'create_item',
                credentialId,
                propsValue: {
                  title: JSON.stringify(reactionTitle),
                  content: '`Reacted to: ${item.title}`',
                },
              }),
            ],
          ),
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

      // The trigger's very first poll tick seeds its `lastPoll` watermark to "now" — wait past one
      // poll interval (`registerActivepiecesBackend`'s 5s) before creating the item the trigger is
      // meant to catch.
      await delay(8000);

      const originalTitle = `E2E Mock Original ${Date.now()}`;
      await workflowE2eCreateMockItem(originalTitle);

      // Verified directly against the mock service's store, same as the action e2e spec — proves
      // the whole round trip (real poll -> real signal -> real compiled action call) actually
      // stored a second item, not just that some internal call chain returned 200.
      await workflowE2eWaitFor(async () => {
        const items = await workflowE2eFetchMockItems();
        return items.some((item) => item.title === reactionTitle && item.content === `Reacted to: ${originalTitle}`);
      }, 30_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 60_000);
});
