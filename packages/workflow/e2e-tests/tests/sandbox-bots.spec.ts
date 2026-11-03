import { expect, test } from './fixtures.js';
import { createApiContext, createProjectViaUI, loginViaUI, openIntegrationsViaUI } from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';

/**
 * Browser tier for ADR 0073 (private), sandbox ("test") bots: the admin saves the platform test bot's token (the
 * Telegram mock answers getMe for any token), then a project's Telegram credential gets the sandbox switch and, once
 * saved, the connect-a-chat dialog with the deep link and QR code. The runtime half is the workflow-tier
 * `integrations-telegram-sandbox.workflow-e2e-spec.ts`.
 */
test.describe('sandbox bots', () => {
  test.describe.configure({ mode: 'serial' });

  test('admin configures the Telegram test bot; the credential editor offers the switch and the connect dialog', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const api = await createApiContext();
    try {
      await api.delete('/admin/settings/sandbox-bots/telegram');

      await loginViaUI(page);
      await page.goto('/admin');
      await page.getByRole('menuitem', { name: 'Test bots' }).click();
      await expect(page.getByTestId('sandbox-bots-page')).toBeVisible();
      await page.getByTestId('sandbox-bot-token-telegram').fill(`e2e-sandbox-${uniqueSuffix()}`);
      await page.getByTestId('sandbox-bot-save-telegram').click();
      await expect(page.getByTestId('sandbox-bot-card-telegram')).toContainText('mock_test_bot');

      await page.goto('/');
      await createProjectViaUI(page, `Sandbox ${uniqueSuffix()}`);
      await openIntegrationsViaUI(page);
      await page.getByRole('button', { name: '+ Add integration' }).click();
      await page.getByRole('combobox', { name: 'Vendor' }).fill('Telegram');
      await page
        .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
        .filter({ hasText: 'Telegram' })
        .first()
        .click();

      await expect(page.getByTestId('sandbox-dev-switch')).toBeVisible();
      await page.getByTestId('sandbox-dev-switch').click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /^(Save|OK|Add)$/ })
        .click();

      // Saving with the switch just turned on opens the connect-a-chat dialog right away.
      await expect(page.getByTestId('sandbox-link-modal')).toBeVisible();
      await expect(page.getByTestId('sandbox-link-url')).toHaveValue(/t\.me\/mock_test_bot\?start=fl_/, {
        timeout: 20_000,
      });
      await expect(page.getByTestId('sandbox-link-qr')).toBeVisible();
    } finally {
      await api.delete('/admin/settings/sandbox-bots/telegram');
      await api.dispose();
    }
  });
});
