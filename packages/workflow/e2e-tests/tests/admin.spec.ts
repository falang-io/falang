import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures.js';
import {
  ADMIN_USERNAME,
  createApiContext,
  createProjectViaUI,
  loginViaUI,
  openIntegrationsViaUI,
  openProjectViaUI,
} from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';

const MOCK_OAUTH2_VENDOR = 'activepieces-mockOAuth2';
const MOCK_OAUTH2_LABEL = 'Mock OAuth2 (test only)';

/**
 * The "Vendor" `Select` in `integrations-editor.tsx` has no `showSearch` and antd renders its
 * dropdown through `@rc-component/virtual-list` (default `listHeight` 256px) — with ~75 registered
 * vendors, only the handful near the current scroll position exist in the DOM at all, so a plain
 * `getByTitle` can miss an option that's really there, just unscrolled-to. In virtualized mode the
 * list's `.rc-virtual-list-holder` has `overflow: hidden` (confirmed against
 * `node_modules/@rc-component/virtual-list/lib/List.js` — real scrolling is driven by `wheel`
 * events the list's own listener translates into a `translateY` on its inner filler, not by the
 * browser's native scroll), so setting `scrollTop` directly is a no-op; this dispatches real
 * `mouse.wheel` ticks over the list instead, checking after each one, until the wanted option shows
 * up in the DOM or the list has scrolled enough to have plainly reached its end.
 *
 * Per the memory convention for this suite, options are matched by `title` inside the open
 * `.ant-select-dropdown`, never `getByRole('option')`.
 */
const findVendorOption = async (page: Page, label: string): Promise<Locator | null> => {
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)');
  const holder = dropdown.locator('.rc-virtual-list-holder');
  const option = dropdown.getByTitle(label, { exact: true });

  const box = await holder.boundingBox();
  if (!box) return null;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // ~75 vendors at a small item height comfortably fit in well under this much scroll; once the
  // list bottoms out, further wheel ticks are harmless no-ops, so a generous fixed step count (with
  // a short pause per step for the list to re-render) is simpler than tracking the filler's
  // transform to detect saturation. Inherently sequential polling, hence the loop-await.
  let step = 0;
  while (step < 40) {
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    if (await option.count()) {
      return option;
    }
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    await page.mouse.wheel(0, 300);
    // oxlint-disable-next-line no-await-in-loop -- inherently sequential polling.
    await page.waitForTimeout(30);
    step += 1;
  }
  return (await option.count()) ? option : null;
};

/**
 * Browser tier for ADR 0030 (private) — the admin
 * sub-app (`/admin`), user roles, and platform-owned OAuth2 clients. Every test uses its own fresh
 * `page` (Playwright's default per-test storage isolation), so logging in as a different user per
 * test needs no explicit logout.
 */
test.describe('admin app', () => {
  // The OAuth-credentials test both enables and disables the mock piece and depends on starting
  // from a known "disabled" state — kept serial so it never overlaps another test in this file
  // (the suite as a whole already runs with `workers: 1` in CI, see playwright.config.ts, but this
  // makes the ordering requirement explicit rather than accidental).
  test.describe.configure({ mode: 'serial' });

  test('seed admin sees the Admin link on the project list and opens /admin to a users table', async ({ page }) => {
    await loginViaUI(page);
    const adminLink = page.getByRole('link', { name: 'Admin' });
    await expect(adminLink).toBeVisible();

    await Promise.all([page.waitForURL(/\/admin$/), adminLink.click()]);
    await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
    await expect(page.getByRole('row', { name: ADMIN_USERNAME })).toBeVisible();
  });

  test('configuring the mock OAuth2 piece enables it for projects; deleting it disables it again', async ({ page }) => {
    test.setTimeout(90_000);
    const api = await createApiContext();
    try {
      // Start from a known-disabled state in case a previous, interrupted run left a row behind.
      await api.delete(`/admin/oauth-credentials/${MOCK_OAUTH2_VENDOR}`);

      await loginViaUI(page);
      await page.goto('/admin');
      await page.getByRole('menuitem', { name: 'OAuth credentials' }).click();

      const row = page.getByRole('row', { name: MOCK_OAUTH2_LABEL });
      await expect(row.getByText('Disabled', { exact: true })).toBeVisible();

      await row.getByRole('button', { name: 'Configure' }).click();
      await page.getByLabel('Client ID').fill('e2e-admin-client-id');
      await page.getByLabel('Client secret').fill('e2e-admin-client-secret');
      await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
      await expect(row.getByText('Enabled', { exact: true })).toBeVisible();

      // Back in the main app: a new project's Integrations editor should now offer the vendor, with
      // no Client ID/Client secret fields (the platform row replaces them).
      const projectName = `Admin OAuth2 ${uniqueSuffix()}`;
      await page.goto('/');
      await createProjectViaUI(page, projectName);
      await openIntegrationsViaUI(page);
      await page.getByRole('button', { name: '+ Add integration' }).click();
      await page.getByRole('combobox', { name: 'Vendor' }).click();
      const enabledOption = await findVendorOption(page, MOCK_OAUTH2_LABEL);
      expect(enabledOption, `"${MOCK_OAUTH2_LABEL}" never scrolled into the virtualized dropdown`).not.toBeNull();
      await enabledOption?.click();
      await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Client ID', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Client secret', { exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');

      // Disable it again from the admin app.
      await page.goto('/admin');
      await page.getByRole('menuitem', { name: 'OAuth credentials' }).click();
      await row.getByRole('button', { name: 'Delete' }).click();
      await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
      await expect(row.getByText('Disabled', { exact: true })).toBeVisible();

      // The catalog is only fetched once per page load (IntegrationsEditor's `useEffect`), so a
      // reload is needed to see the vendor disappear from the select.
      await page.goto('/');
      await openProjectViaUI(page, projectName);
      await openIntegrationsViaUI(page);
      await page.getByRole('button', { name: '+ Add integration' }).click();
      await page.getByRole('combobox', { name: 'Vendor' }).click();
      const disabledOption = await findVendorOption(page, MOCK_OAUTH2_LABEL);
      expect(disabledOption, `"${MOCK_OAUTH2_LABEL}" should no longer be offered, at any scroll position`).toBeNull();
      // Make the negative assertion above meaningful: the dropdown itself still renders options
      // (i.e. this isn't vacuously passing because nothing rendered at all).
      await expect(
        page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').locator('[title]').first(),
      ).toBeVisible();
    } finally {
      await api.delete(`/admin/oauth-credentials/${MOCK_OAUTH2_VENDOR}`).catch(() => {
        // best-effort cleanup — a failure here shouldn't mask the test's own assertion failures
      });
      await api.dispose();
    }
  });

  test('configuring the app-wide AI agent settings; reset clears them again', async ({ page }) => {
    // Covers ADR 0031 (private)'s client half — the admin
    // "AI agent" page and the app-wide `GET /agent/settings` status any signed-in user can read.
    const api = await createApiContext();
    try {
      // Start from a known-unconfigured state in case a previous, interrupted run left settings behind.
      await api.delete('/admin/settings/agent');

      await loginViaUI(page);
      await page.goto('/admin');
      await page.getByRole('menuitem', { name: 'AI agent' }).click();
      await expect(page.getByText('Not configured', { exact: true })).toBeVisible();

      const baseUrl = 'https://api.openai.com/v1';
      const model = `gpt-e2e-${uniqueSuffix()}`;
      await page.getByLabel('Base URL').fill(baseUrl);
      await page.getByLabel('Model').fill(model);
      await page.getByLabel('API key').fill('sk-e2e-test-key');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Configured', { exact: true })).toBeVisible();

      // Any signed-in user's status view reflects the same app-wide configuration.
      const statusResponse = await api.get('/agent/settings');
      expect(statusResponse.ok()).toBeTruthy();
      expect(await statusResponse.json()).toEqual({ configured: true, model });

      // A reload re-fetches the settings from the server — the Base URL/Model survive, the API key
      // is never sent back. The admin app has no router (`AdminNavigationStore` starts on "Users"
      // every load), so the page has to be re-selected from the menu after the reload.
      await page.reload();
      await page.getByRole('menuitem', { name: 'AI agent' }).click();
      await expect(page.getByLabel('Base URL')).toHaveValue(baseUrl);
      await expect(page.getByLabel('Model')).toHaveValue(model);
      await expect(page.getByLabel('API key')).toHaveValue('');

      await page.getByRole('button', { name: 'Reset' }).click();
      await page.getByRole('button', { name: 'Reset', exact: true }).last().click();
      await expect(page.getByText('Not configured', { exact: true })).toBeVisible();
    } finally {
      await api.delete('/admin/settings/agent').catch(() => {
        // best-effort cleanup — a failure here shouldn't mask the test's own assertion failures
      });
      await api.dispose();
    }
  });

  test('a freshly registered user has no Admin link and gets a 403 on /admin', async ({ page }) => {
    const username = `e2e-usr-${uniqueSuffix()}`.slice(0, 32);
    const password = 'password123';
    const api = await createApiContext();
    const registerResponse = await api.post('/auth/register', { data: { username, password } });
    expect(registerResponse.ok()).toBeTruthy();
    await api.dispose();

    await loginViaUI(page, username, password);
    await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);

    await page.goto('/admin');
    await expect(page.getByText('403', { exact: true })).toBeVisible();
  });
});
