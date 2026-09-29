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

const ACTIVEPIECES_MOCK_BASIC_AUTH_VENDOR = 'activepieces-mockBasicAuth';

/**
 * Workflow-tier port of `@falang/workflow-e2e-tests`' `integrations-activepieces-mock-basic-auth.spec.ts`
 * — see ADR 0018 (private). `mockBasicAuthPiece` is a second test-only
 * fixture (see ADR 0014 (private)) proving `BasicAuth` (a two-field, non-CustomAuth shape —
 * `username` text + `password` secret) round-trips through credential seeding ->
 * `resolveAuthValue` -> the action's real `context.auth`, from inside a real runner pod. Needs the
 * real `docker-compose.workflow-e2e.yml` stack up with `activepieces` included.
 */
describe('integrations (workflow tier, mock service): ActivePieces BasicAuth', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  it('activepieces-action who_am_i resolves the seeded BasicAuth username into context.auth', async () => {
    const credentialId = `cred-${Date.now()}`;
    const itemTitle = `E2E BasicAuth Item ${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier Mock BasicAuth ${Date.now()}` },
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
                vendor: ACTIVEPIECES_MOCK_BASIC_AUTH_VENDOR,
                name: 'E2E BasicAuth account',
                fields: { username: 'alice', password: { dev: 'hunter2', prod: 'hunter2' } },
              },
            ],
          },
        },
        {
          id: 'fn',
          type: 'function',
          name: 'whoAmI',
          folderId: null,
          pinned: false,
          root: buildFunctionNode('fn', [
            buildActivepiecesActionNode('fn-action', {
              pieceName: 'mockBasicAuth',
              actionName: 'who_am_i',
              credentialId,
              propsValue: { title: JSON.stringify(itemTitle) },
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

      const result = await workflowE2eStartAndAwaitResult('whoAmI', `workflow-dev-${projectId}`);
      expect(result).toBeUndefined();

      // `content` holds whatever `context.auth.username` actually was at run time — asserting it's
      // exactly the seeded 'alice' (not empty, not the credentialId, not the password) is what
      // proves the BasicAuth-specific field mapping, not just CustomAuth's.
      await workflowE2eWaitFor(async () => {
        const items = await workflowE2eFetchMockItems();
        return items.some((entry) => entry.title === itemTitle);
      }, 20_000);
      const items = await workflowE2eFetchMockItems();
      expect(items.find((entry) => entry.title === itemTitle)?.content).toBe('alice');
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 60_000);
});
