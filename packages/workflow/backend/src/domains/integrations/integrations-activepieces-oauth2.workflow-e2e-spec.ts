import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_ACTIVEPIECES_URL,
  WORKFLOW_E2E_BACKEND_URL,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eFetchMockItems,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
  workflowE2eWaitForValue,
} from '../../test-utils/workflow-e2e-client.js';
import { buildActivepiecesActionNode, buildFunctionNode } from '../../test-utils/workflow-e2e-fixtures.js';

const ACTIVEPIECES_MOCK_OAUTH2_VENDOR = 'activepieces-mockOAuth2';

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
 * Workflow-tier port of the *runtime* half of `@falang/workflow-e2e-tests`'
 * `integrations-activepieces-mock-oauth2.spec.ts` — see ADR 0018 (private).
 * The browser-tier spec now only covers the editor's own "Connect" popup mechanics (a real popup
 * opening, closing, and the "Connected" label appearing); everything about the underlying OAuth2
 * dance and the reactive-refresh behavior lives here instead, driven entirely over HTTP — no browser,
 * no popup.
 *
 * This split is only possible because `routes/mock-oauth2.ts`'s `/authorize` endpoint auto-approves
 * with a plain 302 redirect (a deterministic fixture, not a real consent screen) — there is no user
 * interaction anywhere in the dance that would require a real page. The two hops this test follows
 * itself use docker-internal hostnames baked in server-side (`mock-oauth2-piece.ts`'s
 * `MOCK_OAUTH_BASE_URL`, `http://activepieces:4100/mock-oauth2`; `OAuth2Controller`'s
 * `BACKEND_PUBLIC_URL`, `http://backend:4000`) — reachable by a browser running *inside* the compose
 * network, not by this host-side test process. Both are rewritten to this stack's host-published
 * equivalents (`WORKFLOW_E2E_ACTIVEPIECES_URL`/`WORKFLOW_E2E_BACKEND_URL`) before being followed, the
 * same docker-internal-name-substitution already used for `RUNNER_MOCKS_URL`/`KIND_GATEWAY_IP`
 * elsewhere in these specs, just applied to a URL this test follows itself instead of one embedded
 * into workflow-node data a runner pod fetches later.
 *
 * Since ADR 0030 (private), the mock piece's
 * `client_id`/`client_secret` are no longer instance fields at all — this test creates the platform
 * `oauth_credentials` row itself (`PUT /admin/oauth-credentials/:vendor`) before running and deletes
 * it again in `afterAll`, rather than relying on any other spec's own setup.
 */
describe('integrations (workflow tier, mock service): ActivePieces OAuth2', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
    const response = await workflowE2eApi()
      .put(`/admin/oauth-credentials/${ACTIVEPIECES_MOCK_OAUTH2_VENDOR}`)
      .set(workflowE2eAuth(token))
      .send({ clientId: 'e2e-platform-client-id', clientSecret: 'e2e-platform-client-secret' });
    if (response.status !== 200) {
      throw new Error(`Failed to configure the platform OAuth2 credential: ${response.status} ${response.text}`);
    }
  });

  afterAll(async () => {
    await workflowE2eApi()
      .delete(`/admin/oauth-credentials/${ACTIVEPIECES_MOCK_OAUTH2_VENDOR}`)
      .set(workflowE2eAuth(token));
  });

  it('Connect completes the OAuth2 dance over plain HTTP, and a later run refreshes the expired token', async () => {
    const credentialId = `cred-${Date.now()}`;
    const itemTitle = `E2E OAuth2 Item ${Date.now()}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier OAuth2 ${Date.now()}` },
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
                vendor: ACTIVEPIECES_MOCK_OAUTH2_VENDOR,
                name: 'E2E OAuth2 account',
                fields: {},
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
              pieceName: 'mockOAuth2',
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

    const importedCredentialId = await findImportedInstanceId(token, projectId);
    try {
      // Same dance a real "Connect" click drives: POST /oauth2/start for the authorizeUrl, follow
      // it to the mock's auto-approving redirect, follow *that* to the backend's own callback —
      // see this file's own doc comment for why each hop's docker-internal hostname is rewritten
      // first.
      const startResponse = await workflowE2eApi()
        .post(`/projects/${projectId}/integrations/${importedCredentialId}/oauth2/start`)
        .set(workflowE2eAuth(token));
      expect(startResponse.status).toBe(201);
      const authorizeUrl = (startResponse.body as { authorizeUrl: string }).authorizeUrl.replace(
        'http://activepieces:4100',
        WORKFLOW_E2E_ACTIVEPIECES_URL,
      );

      const authorizeResponse = await fetch(authorizeUrl, { redirect: 'manual' });
      expect(authorizeResponse.status).toBe(302);
      const callbackLocation = authorizeResponse.headers.get('location');
      if (!callbackLocation) throw new Error('mock-oauth2 /authorize did not redirect');
      const callbackUrl = callbackLocation.replace('http://backend:4000', WORKFLOW_E2E_BACKEND_URL);

      const callbackResponse = await fetch(callbackUrl);
      expect(callbackResponse.ok).toBe(true);

      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await workflowE2eWaitFor(async () => {
        const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
        return (response.body as { running?: boolean }).running === true;
      }, 60_000);

      const result1 = await workflowE2eStartAndAwaitResult('whoAmI', `workflow-dev-${projectId}`);
      expect(result1).toBeUndefined();
      const [firstToken] = await workflowE2eWaitForValue(async () => {
        const items = await workflowE2eFetchMockItems();
        const contents = items.filter((item) => item.title === itemTitle).map((item) => item.content);
        if (contents.length > 0) return contents;
      }, 20_000);
      expect(firstToken).toMatch(/^mock-access-/);

      // The mock authorization server issues 2-second-lived tokens (see routes/mock-oauth2.ts) —
      // waiting past that forces `auth-resolver.ts`'s reactive refresh to fire on the next run, no
      // new Connect dance needed.
      await delay(2500);

      const result2 = await workflowE2eStartAndAwaitResult('whoAmI', `workflow-dev-${projectId}`);
      expect(result2).toBeUndefined();
      const [, secondToken] = await workflowE2eWaitForValue(async () => {
        const items = await workflowE2eFetchMockItems();
        const contents = items.filter((item) => item.title === itemTitle).map((item) => item.content);
        if (contents.length > 1) return contents;
      }, 20_000);
      expect(secondToken).toMatch(/^mock-access-/);
      expect(secondToken).not.toBe(firstToken);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 90_000);
});
