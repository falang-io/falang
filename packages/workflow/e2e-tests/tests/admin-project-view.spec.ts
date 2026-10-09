import { randomUUID } from 'node:crypto';
import { request as pwRequest } from '@playwright/test';
import { test, expect } from './fixtures.js';
import { BACKEND_URL, loginViaUI } from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';

/**
 * An admin opens another user's project from the admin app's user "Details" and sees it read-only:
 * no "+ Add", no Dev/Prod menus, a read-only tag naming the owner, and no document write is ever sent.
 */
test.describe('admin views another user’s project', () => {
  test('opens it read-only from the user details', async ({ page }) => {
    test.setTimeout(90_000);
    const username = `viewed-${uniqueSuffix()}`;
    const password = 'password123';
    const projectName = `Viewed ${uniqueSuffix()}`;

    // Seed: a regular user with one project and one function document, all through the API.
    const anonymous = await pwRequest.newContext({ baseURL: BACKEND_URL });
    const registerResponse = await anonymous.post('/auth/register', { data: { username, password } });
    expect(registerResponse.ok()).toBe(true);
    const loginResponse = await anonymous.post('/auth/login', { data: { username, password } });
    const { accessToken } = (await loginResponse.json()) as { accessToken: string };
    const user = await pwRequest.newContext({
      baseURL: BACKEND_URL,
      extraHTTPHeaders: { Authorization: `Bearer ${accessToken}` },
    });
    const projectResponse = await user.post('/projects', { data: { name: projectName } });
    const project = (await projectResponse.json()) as { id: string };
    const documentResponse = await user.post(`/projects/${project.id}/documents`, {
      data: { id: randomUUID(), type: 'function', name: 'greet', folderId: null },
    });
    expect(documentResponse.ok()).toBe(true);

    await loginViaUI(page);
    await page.goto('/admin');
    const row = page.getByRole('row', { name: username });
    await row.getByRole('button', { name: '1', exact: true }).click();
    const details = page.getByRole('dialog');
    const openLink = details.getByTestId('admin-open-project');
    await expect(details.getByText(projectName)).toBeVisible();
    await expect(openLink).toHaveAttribute('href', `/#/projects/${project.id}`);

    const writes: string[] = [];
    page.on('request', (sent) => {
      if (sent.url().includes(`/projects/${project.id}`) && sent.method() !== 'GET') writes.push(sent.url());
    });
    await page.goto(`/#/projects/${project.id}`);

    await expect(page.getByTestId('toolbar-read-only')).toContainText(username);
    await expect(page.getByRole('treeitem', { name: /greet/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Dev/ })).toHaveCount(0);

    await page.getByRole('treeitem', { name: /greet/ }).click();
    await expect(page.locator('[id^="scheme-"]').first()).toBeVisible();

    await page.getByTestId('toolbar-project-menu').click();
    await expect(page.getByRole('menuitem', { name: 'History' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Files' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Give any (wrongly scheduled) autosave its debounce window before asserting nothing was written.
    await page.waitForTimeout(1500);
    expect(writes).toEqual([]);

    await anonymous.dispose();
    await user.dispose();
  });
});
