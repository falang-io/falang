import { test, expect } from './fixtures.js';
import { loginViaUI } from './fixtures.js';

test.describe('auth', () => {
  test('shows a login screen on first visit', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('rejects wrong credentials with an error message', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/invalid username or password/i)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('logs in with the seeded admin/admin account and reaches the project list', async ({ page }) => {
    await loginViaUI(page);
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  test('stays logged in across a reload (token persisted)', async ({ page }) => {
    await loginViaUI(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });

  test('logout returns to the login screen and clears the session', async ({ page }) => {
    await loginViaUI(page);
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('signing up with an e-mail shows the "e-mail not confirmed" banner', async ({ page }) => {
    const suffix = Date.now().toString(36);
    const email = `banner${suffix}@example.test`;
    await page.goto('/');
    await page.getByRole('button', { name: 'Create an account' }).click();
    await page.getByLabel('Username').fill(`banner${suffix}`);
    await page.getByLabel('E-mail (optional)').fill(email);
    await page.getByLabel('Password').fill('banner-password-1');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await expect(page.getByText(`Your e-mail ${email} is not confirmed yet.`)).toBeVisible();
  });
});
