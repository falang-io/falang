import { test, expect } from './fixtures.js';
import { createProjectViaUI, loginAndReachProjectList, openProjectViaUI } from './fixtures.js';

test.describe('projects', () => {
  test('creates a project and opens it into the workspace', async ({ page }) => {
    await loginAndReachProjectList(page);
    const name = `Project ${Date.now()}`;

    await createProjectViaUI(page, name);
    await expect(page.getByText(name, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '← Projects' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();

    await openProjectViaUI(page, name);
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    // Every project is seeded with a pinned `integrations` document and the three fixed sections
    // (ADR 0055 (private)) — a fresh tree is never truly empty.
    await expect(page.getByRole('treeitem', { name: '🔌 Integrations' })).toBeVisible();
    await Promise.all(
      ['Triggers', 'Functions', 'Types'].map((section) =>
        expect(page.getByRole('treeitem', { name: section })).toBeVisible(),
      ),
    );
  });

  test('lists multiple projects and opens the right one', async ({ page }) => {
    await loginAndReachProjectList(page);
    const nameA = `Project A ${Date.now()}`;
    const nameB = `Project B ${Date.now()}`;

    await createProjectViaUI(page, nameA);
    await page.getByRole('button', { name: '← Projects' }).click();
    await createProjectViaUI(page, nameB);
    await page.getByRole('button', { name: '← Projects' }).click();

    await expect(page.getByText(nameA, { exact: true })).toBeVisible();
    await expect(page.getByText(nameB, { exact: true })).toBeVisible();

    await openProjectViaUI(page, nameA);
    await expect(page.getByText(nameA, { exact: true })).toBeVisible();
  });
});
