import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { test, expect } from './fixtures.js';
import {
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  getIntegrationsDocumentId,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';
import { buildFunctionNode } from './node-builders.js';

/**
 * Browser-tier spec for "Send message with buttons": the block lists its buttons on the scheme, a double click opens the
 * sidebar editor with one card per button, and a button added there reaches the stored document. Sending and the
 * command press are covered by the workflow-tier `integrations-telegram.workflow-e2e-spec.ts`.
 */
test.describe('message buttons', () => {
  test('shows the buttons on the block and adds one in the sidebar editor', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAndReachProjectList(page);
    const projectName = `Message buttons ${uniqueSuffix()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const credentialId = `cred-telegram-${uniqueSuffix()}`;

    const api = await createApiContext();
    const integrationsDocId = await getIntegrationsDocumentId(api, projectId);
    await api.patch(`/projects/${projectId}/documents/${integrationsDocId}`, {
      data: {
        data: {
          instances: [
            {
              id: credentialId,
              vendor: telegramIntegration.vendor,
              name: 'Mock Bot',
              fields: { botToken: { dev: 'token', prod: 'token' } },
            },
          ],
        },
      },
    });
    const menuId = await createTreeItemViaUI(page, 'function', 'menu');
    await api.patch(`/projects/${projectId}/documents/${menuId}`, {
      data: {
        root: buildFunctionNode(menuId, [
          {
            id: `${menuId}-send`,
            name: 'telegram-send-buttons',
            data: {
              credentialId,
              chatId: '42',
              text: 'Menu',
              buttons: JSON.stringify([
                { kind: 'url', text: 'Site', value: 'https://example.com' },
                { kind: 'command', text: 'Help', value: '/help' },
              ]),
            },
          },
        ]),
      },
    });
    await page.reload();
    await openProjectViaUI(page, projectName);
    await page.getByRole('treeitem', { name: 'menu' }).click();

    const scheme = page.locator(`#scheme-${menuId}`);
    const views = scheme.getByTestId('message-button-view');
    await expect(views).toHaveCount(2);
    await expect(views.nth(0)).toContainText('[Site]');
    await expect(views.nth(0)).toContainText('https://example.com');
    await expect(views.nth(1)).toContainText('/help');

    await scheme.locator('.block-container', { hasText: '[Help]' }).first().dblclick();
    const editor = page.getByTestId('message-buttons-editor');
    await expect(editor).toBeVisible();
    await expect(editor.getByTestId('message-button-row')).toHaveCount(2);

    await editor.getByTestId('message-button-add').click();
    const rows = editor.getByTestId('message-button-row');
    await expect(rows).toHaveCount(3);
    // The new row's caption is its first Monaco field.
    await rows.nth(2).locator('.monaco-editor .view-lines').first().click();
    await page.keyboard.type('Docs');
    await rows.nth(2).locator('.monaco-editor .view-lines').nth(1).click();
    await page.keyboard.type('https://docs.example.com');
    // A click on the empty canvas commits the edit.
    await scheme.click({ position: { x: 60, y: 400 } });

    await expect(views).toHaveCount(3, { timeout: 15_000 });
    await expect(views.nth(2)).toContainText('[Docs]');
    await expect
      .poll(
        async () => {
          const response = await api.get(`/projects/${projectId}/documents`);
          const documents = (await response.json()) as {
            id: string;
            root?: { children?: { children?: { data?: unknown }[] }[] };
          }[];
          const document = documents.find((candidate) => candidate.id === menuId);
          const node = document.root?.children?.[1]?.children?.[0];
          return JSON.parse(String((node?.data as { buttons?: string } | undefined)?.buttons ?? '[]'));
        },
        { timeout: 15_000 },
      )
      .toEqual([
        { kind: 'url', text: 'Site', value: 'https://example.com' },
        { kind: 'command', text: 'Help', value: '/help' },
        { kind: 'url', text: 'Docs', value: 'https://docs.example.com' },
      ]);
    await api.dispose();
  });
});
