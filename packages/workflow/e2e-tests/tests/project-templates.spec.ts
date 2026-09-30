import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { createApiContext, loginViaUI } from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';

const openTemplateDropdown = async (page: Page): Promise<void> => {
  await page.getByTestId('project-template-select').locator('.ant-select').click();
};

/**
 * Browser tier for the project templates (Stage 0, P4): the seeded "Blank project" template and an
 * admin-created one appear in the "New project" dialog's template picker. NOT yet run — written
 * against the real locators/test ids added with the feature; the orchestrator runs the whole suite.
 */
test.describe('project templates', () => {
  test.describe.configure({ mode: 'serial' });

  test('a user creates a project from the seeded blank template', async ({ page }) => {
    await loginViaUI(page);
    const name = `From blank ${uniqueSuffix()}`;

    await page.getByRole('button', { name: '+ New project' }).click();
    await openTemplateDropdown(page);
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByTitle('Blank project').click();
    await page.getByPlaceholder('Project name').fill(name);
    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes('/projects/from-template/') && res.request().method() === 'POST',
      ),
      page.getByRole('dialog').getByRole('button', { name: 'Create' }).click(),
    ]);
    expect(response.status()).toBe(201);

    // Creating navigates into the new project; going back, it is in the list.
    await expect(page.getByRole('treeitem', { name: '🔌 Integrations' })).toBeVisible();
    await page.getByRole('button', { name: '← Projects' }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  });

  test('an admin creates a template from a project and it shows up in the picker', async ({ page }) => {
    test.setTimeout(90_000);
    const api = await createApiContext();
    const templateName = `Template ${uniqueSuffix()}`;
    const sourceName = `Template source ${uniqueSuffix()}`;
    let templateId: string | null = null;
    try {
      const created = await api.post('/projects', { data: { name: sourceName } });
      expect(created.ok()).toBe(true);

      await loginViaUI(page);
      await page.goto('/admin');
      await page.getByRole('menuitem', { name: 'Project templates' }).click();
      await page.getByTestId('create-template').click();

      const dialog = page.getByRole('dialog');
      await dialog.getByTestId('template-name').fill(templateName);
      await dialog.getByTestId('template-source-project').click();
      await page
        .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        .getByTitle(sourceName, { exact: true })
        .click();
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('row', { name: templateName })).toBeVisible();

      const list = await api.get('/admin/project-templates');
      const rows = (await list.json()) as { id: string; name: string }[];
      templateId = rows.find((row) => row.name === templateName)?.id ?? null;

      await page.goto('/');
      await page.getByRole('button', { name: '+ New project' }).click();
      await openTemplateDropdown(page);
      await expect(
        page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByTitle(templateName, { exact: true }),
      ).toBeVisible();
    } finally {
      if (templateId) await api.delete(`/admin/project-templates/${templateId}`);
      await api.dispose();
    }
  });
});
