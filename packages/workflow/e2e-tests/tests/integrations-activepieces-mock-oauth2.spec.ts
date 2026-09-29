import { test, expect } from './fixtures.js';
import {
  createApiContext,
  createProjectViaUI,
  getIntegrationsDocumentId,
  loginAndReachProjectList,
  openIntegrationsViaUI,
  openProjectViaUI,
} from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';

const ACTIVEPIECES_MOCK_OAUTH2_VENDOR = 'activepieces-mockOAuth2';

/**
 * Browser-only half of the ActivePieces OAuth2 flow (see ADR 0018 (private)) —
 * the underlying OAuth2 dance and the reactive-refresh runtime behavior moved to
 * `integrations-activepieces-oauth2.workflow-e2e-spec.ts` (`@falang/workflow-backend`), driven over
 * plain HTTP with no browser at all, now that `routes/mock-oauth2.ts`'s auto-approving `/authorize`
 * endpoint was found to need no real page interaction. What's left here is the one thing that
 * genuinely needs a real page: the editor's own "Connect" button opening a real popup, that popup
 * completing a real top-level navigation round trip, and the editor noticing the popup closed and
 * flipping its own UI to "Connected" — none of which a headless HTTP client can exercise.
 *
 * Since ADR 0030 (private), the mock piece's
 * `client_id`/`client_secret` are no longer instance fields — this spec creates the platform
 * `oauth_credentials` row itself (`PUT /admin/oauth-credentials/:vendor`, admin token) before the
 * test and removes it again afterwards, independent of `admin.spec.ts`'s own enable/disable cycle.
 */
test.describe('integrations (mock service): ActivePieces OAuth2', () => {
  test('Connect button opens a popup, and the editor shows "Connected" once it completes', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAndReachProjectList(page);
    const projectName = `Mock OAuth2 Popup ${uniqueSuffix()}`;
    const projectId = await createProjectViaUI(page, projectName);

    const credentialId = `cred-${uniqueSuffix()}`;
    const api = await createApiContext();
    try {
      const upsertResponse = await api.put(`/admin/oauth-credentials/${ACTIVEPIECES_MOCK_OAUTH2_VENDOR}`, {
        data: { clientId: 'e2e-platform-client-id', clientSecret: 'e2e-platform-client-secret' },
      });
      expect(upsertResponse.ok()).toBeTruthy();

      const integrationsDocId = await getIntegrationsDocumentId(api, projectId);
      await api.patch(`/projects/${projectId}/documents/${integrationsDocId}`, {
        data: {
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
      });

      await page.reload();
      await openProjectViaUI(page, projectName);
      await openIntegrationsViaUI(page);
      await page.getByRole('button', { name: 'Edit' }).click();

      const popupPromise = page.context().waitForEvent('page');
      await page.getByRole('button', { name: 'Connect' }).click();
      const popup = await popupPromise;
      await popup.waitForEvent('close', { timeout: 20_000 });
      await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    } finally {
      await api.delete(`/admin/oauth-credentials/${ACTIVEPIECES_MOCK_OAUTH2_VENDOR}`).catch(() => {
        // best-effort cleanup — a failure here shouldn't mask the test's own assertion failures
      });
      await api.dispose();
    }
  });
});
