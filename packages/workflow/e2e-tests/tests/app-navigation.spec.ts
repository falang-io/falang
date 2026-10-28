import { test, expect } from './fixtures.js';
import { clickProjectMenuItem, createProjectViaUI, loginAndReachProjectList } from './fixtures.js';

/**
 * The app header (brand, Projects / Admin / Runs / Tasks, the user menu with Settings / Access tokens / Logout), the
 * floating support chat, and inside a project the Files/Tasks system tabs and the project "Settings" modal.
 */
test.describe('app navigation', () => {
  test('header sections stay on top and highlight the current one', async ({ page }) => {
    await loginAndReachProjectList(page);
    await expect(page.getByTestId('nav-projects')).toHaveAttribute('data-active', 'true');
    // The seeded admin sees the Admin link.
    await expect(page.getByTestId('nav-admin')).toBeVisible();

    await page.getByTestId('nav-runs').click();
    await expect(page).toHaveURL(/#\/runs$/);
    await expect(page.getByTestId('app-header')).toBeVisible();
    await expect(page.getByTestId('nav-runs')).toHaveAttribute('data-active', 'true');
    await expect(page.getByTestId('nav-projects')).not.toHaveAttribute('data-active', 'true');

    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/#\/settings$/);
    await expect(page.getByTestId('settings-login')).toHaveText('admin');
    await page.getByTestId('settings-change-password').click();
    await expect(page.getByRole('dialog', { name: 'Change password' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByTestId('user-menu').click();
    await page.getByRole('menuitem', { name: 'Access tokens' }).click();
    await expect(page).toHaveURL(/#\/tokens$/);
    await expect(page.getByTestId('tokens-page')).toBeVisible();

    await page.getByTestId('falang-brand').click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  test('support chat opens as a popup and closes again', async ({ page }) => {
    await loginAndReachProjectList(page);
    await page.getByTestId('support-button').click();
    await expect(page.getByTestId('support-popup')).toBeVisible();
    await page.getByTestId('support-button').click();
    await expect(page.getByTestId('support-popup')).toHaveCount(0);
  });

  test('Files and Tasks open as closable tabs; servers and run journal share one Settings modal', async ({ page }) => {
    await loginAndReachProjectList(page);
    await createProjectViaUI(page, `Navigation ${Date.now()}`);

    await clickProjectMenuItem(page, 'Files');
    await expect(page.getByTestId('system-tab-files')).toBeVisible();
    await expect(page).toHaveURL(/\/files$/);
    await clickProjectMenuItem(page, 'Tasks');
    await expect(page.getByTestId('system-tab-tasks')).toBeVisible();
    await expect(page).toHaveURL(/\/tasks$/);
    // Back to Files by its tab; closing it leaves Tasks.
    await page.getByTestId('system-tab-files').click();
    await expect(page).toHaveURL(/\/files$/);
    await page
      .locator('.ant-tabs-tab', { has: page.getByTestId('system-tab-files') })
      .getByRole('button', { name: 'remove' })
      .click();
    await expect(page.getByTestId('system-tab-files')).toHaveCount(0);
    await expect(page).toHaveURL(/\/tasks$/);

    await clickProjectMenuItem(page, 'Settings');
    await expect(page.getByTestId('project-settings-modal')).toBeVisible();
    await expect(page.getByTestId('runtime-settings')).toBeVisible();
    await page.getByTestId('project-settings-tab-run-journal').click();
    await expect(page.getByTestId('run-journal-store-texts')).toBeVisible();
  });
});
