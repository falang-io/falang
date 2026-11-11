import { test, expect } from './fixtures.js';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import {
  createApiContext,
  createProjectViaUI,
  getIntegrationsDocumentId,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';

/** The e2e stacks build the client with this `VITE_DOCS_URL` (docker-compose.workflow-e2e.yml, scripts/test-e2e-fast.ts). */
const DOCS_HOST = 'https://docs.e2e.test';

/** The documentation "?" in the top bars and next to the messenger triggers' Chats/Conversation fields. */
test.describe('documentation links', () => {
  test('the top bars and the new-trigger form link into the docs', async ({ page }) => {
    await loginAndReachProjectList(page);
    await expect(page.getByTestId('docs-button')).toHaveAttribute('href', `${DOCS_HOST}/`);
    await expect(page.getByTestId('docs-button')).toHaveAttribute('target', '_blank');

    const projectName = `Docs Links ${uniqueSuffix()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const api = await createApiContext();
    const integrationsDocId = await getIntegrationsDocumentId(api, projectId);
    const token = `e2e-${uniqueSuffix()}`;
    await api.patch(`/projects/${projectId}/documents/${integrationsDocId}`, {
      data: {
        data: {
          instances: [
            {
              id: `cred-telegram-${uniqueSuffix()}`,
              vendor: telegramIntegration.vendor,
              name: 'Docs Bot',
              fields: { botToken: { dev: token, prod: token } },
            },
          ],
        },
      },
    });
    // The workspace loaded the integrations document before the PATCH — reload to see the credential.
    await page.reload();
    await openProjectViaUI(page, projectName);
    await expect(page.getByTestId('docs-button')).toHaveAttribute('href', `${DOCS_HOST}/`);

    await page.getByRole('button', { name: '+ Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Trigger' }).click();
    // Same option targeting as `createTriggerFunctionViaUI` (antd's visible rows carry no ARIA role).
    const openDropdownOption = (label: string) =>
      page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByTitle(label, { exact: true });
    await page.getByRole('combobox', { name: 'Credentials' }).click();
    await openDropdownOption('Docs Bot (Telegram)').click();
    await page.getByRole('combobox', { name: 'Trigger type' }).click();
    await openDropdownOption('On message').click();

    const fieldLinks = page.getByRole('dialog').getByTestId('field-docs-link');
    // Chats and Conversation.
    await expect(fieldLinks).toHaveCount(2);
    const links = await fieldLinks.all();
    await Promise.all(
      links.flatMap((link) => [
        expect(link).toHaveAttribute('href', `${DOCS_HOST}/workflow/bot-conversations/`),
        expect(link).toHaveAttribute('target', '_blank'),
      ]),
    );
  });
});
