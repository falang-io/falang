import { test, expect } from './fixtures.js';
import { ADMIN_PASSWORD, ADMIN_USERNAME, createApiContext } from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';

const FN_ID = '9a1c3b6e-4f2d-4e8a-b7c0-1d2e3f4a5b6c';

/**
 * A visitor without an account opens `#/templates/<slug>`: the template opens as an editable project kept in the
 * browser with a single "Sign in to save" button; after signing in, the edited project is created in the account.
 */
test.describe('guest template', () => {
  test('a guest edits a template, signs in and gets it as a new project', async ({ page }) => {
    test.setTimeout(90_000);
    const api = await createApiContext();
    const slug = `guest-${uniqueSuffix()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]/g, '')}`;
    const templateName = `Guest template ${slug}`;
    let templateId: string | null = null;
    try {
      const created = await api.put(`/admin/project-templates/by-slug/${slug}`, {
        data: {
          name: templateName,
          payload: {
            formatVersion: 1,
            project: { id: '', name: templateName },
            folders: [],
            documents: [
              { id: FN_ID, type: 'function', name: 'helper', folderId: null, pinned: false, root: null, data: null },
            ],
          },
        },
      });
      expect(created.ok()).toBe(true);
      templateId = ((await created.json()) as { id: string }).id;

      await page.goto(`/#/templates/${slug}`);
      await expect(page.getByTestId('guest-template-bar')).toContainText(templateName);
      await expect(page.getByRole('treeitem', { name: '⚙ helper' })).toBeVisible();
      // The project's menus and the dev/prod controls are not there.
      await expect(page.getByTestId('user-menu')).toHaveCount(0);

      await page.getByRole('button', { name: '+ Add' }).click();
      await page.getByRole('menuitem', { name: 'Function' }).click();
      await page.getByPlaceholder('Function name...').fill('guestAdded');
      await page.getByPlaceholder('Function name...').press('Enter');
      await expect(page.getByRole('treeitem', { name: '⚙ guestAdded' })).toBeVisible();

      // The edit survives a reload (the draft in localStorage).
      await page.reload();
      await expect(page.getByRole('treeitem', { name: '⚙ guestAdded' })).toBeVisible();

      await page.getByTestId('guest-sign-in-to-save').click();
      await page.getByLabel('Username').fill(ADMIN_USERNAME);
      await page.getByLabel('Password').fill(ADMIN_PASSWORD);
      const [imported] = await Promise.all([
        page.waitForResponse((res) => res.url().endsWith('/projects/import') && res.request().method() === 'POST'),
        page.getByRole('button', { name: 'Sign in' }).click(),
      ]);
      expect(imported.status()).toBe(201);
      const projectId = ((await imported.json()) as { id: string }).id;

      await expect(page).toHaveURL(new RegExp(`#/projects/${projectId}`));
      await expect(page.getByRole('treeitem', { name: '⚙ guestAdded' })).toBeVisible();
      await expect(page.getByRole('treeitem', { name: '⚙ helper' })).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('falang:guest-project-draft'))).toBeNull();
      await api.delete(`/projects/${projectId}`);
    } finally {
      if (templateId) await api.delete(`/admin/project-templates/${templateId}`);
      await api.dispose();
    }
  });
});
