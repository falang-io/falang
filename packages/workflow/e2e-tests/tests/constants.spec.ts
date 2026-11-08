import { test, expect } from './fixtures.js';
import {
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';
import { buildFunctionNode, buildLogNode } from './node-builders.js';

/**
 * Browser-tier spec for project constants: a constant added in the pinned "Constants" document becomes a known global
 * in every code field — a field that used it before it existed is flagged by the background validation, and the error
 * goes away once the constant is saved; the constant is stored with its dev and prod values.
 */
test.describe('project constants', () => {
  test('adding a constant makes it known to the code fields', async ({ page }) => {
    test.setTimeout(150_000);
    await loginAndReachProjectList(page);
    const projectName = `Constants ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const fnId = await createTreeItemViaUI(page, 'function', 'callApi');

    const api = await createApiContext();
    await api.patch(`/projects/${projectId}/documents/${fnId}`, {
      data: { root: buildFunctionNode(fnId, [buildLogNode(`${fnId}-log`, 'calling ${API_URL}')]) },
    });
    await page.reload();
    await openProjectViaUI(page, projectName);

    // Before the constant exists, the log field is an error.
    await page.getByRole('treeitem', { name: 'callApi' }).click();
    const scheme = page.locator(`#scheme-${fnId}`);
    await expect(scheme.locator('.block-body.has-error')).toHaveCount(1, { timeout: 30_000 });

    // Add API_URL in the Constants document; the name is upper-cased while typing.
    await page.getByRole('treeitem', { name: 'Constants' }).click();
    const editor = page.getByTestId('constants-editor');
    await expect(editor).toBeVisible();
    await page.getByTestId('constants-add').click();
    await page.getByTestId('constant-name').fill('api url');
    await expect(page.getByTestId('constant-name')).toHaveValue('API_URL');
    await page.getByTestId('constant-dev').fill('https://dev.example');
    await page.getByTestId('constant-prod').fill('https://example.com');
    await page.getByTestId('constant-save').click();
    await expect(editor.getByTestId('constant-row-API_URL')).toContainText('https://dev.example');

    // Saved with both values.
    await expect
      .poll(
        async () => {
          const response = await api.get(`/projects/${projectId}/documents`);
          const documents = (await response.json()) as { type: string; data?: { constants?: unknown[] } }[];
          return documents.find((doc) => doc.type === 'constants')?.data?.constants;
        },
        { timeout: 15_000 },
      )
      .toEqual([
        expect.objectContaining({
          name: 'API_URL',
          type: 'string',
          dev: 'https://dev.example',
          prod: 'https://example.com',
        }),
      ]);

    // The function's field is valid now.
    await page.getByRole('tab', { name: /callApi/ }).click();
    await expect(scheme.locator('.block-body.has-error')).toHaveCount(0, { timeout: 30_000 });

    // An invalid name is refused in the dialog.
    await page.getByRole('treeitem', { name: 'Constants' }).click();
    await page.getByTestId('constants-add').click();
    await page.getByTestId('constant-name').fill('9LIVES');
    await page.getByTestId('constant-save').click();
    await expect(page.getByRole('dialog').locator('.ant-form-item-has-error')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(editor.locator('tbody tr')).toHaveCount(1);
    await api.dispose();
  });
});
