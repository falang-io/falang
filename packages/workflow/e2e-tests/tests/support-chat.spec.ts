import { test, expect } from './fixtures.js';
import { BACKEND_URL, loginViaUI } from './fixtures.js';
import { uniqueSuffix } from './integration-test-helpers.js';

/**
 * Browser tier for the user <-> administrator support chat: a regular user writes from the product, the seeded admin
 * (a second browser context, so both sessions are live at once) sees the thread in the admin app and replies, and the
 * user sees the reply plus the unread badge. Polling only (60s unread badge, 10s open drawer, 15s admin), so the
 * assertions that wait on a poll use a generous timeout.
 */
test.describe('support chat', () => {
  test('user writes, admin replies from /admin, user sees the reply and the unread badge', async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(150_000);
    const baseURL = test.info().project.use.baseURL;
    const username = `support-${uniqueSuffix()}`;
    const password = 'password123';
    const registered = await request.post(`${BACKEND_URL}/auth/register`, { data: { username, password } });
    expect(registered.ok()).toBeTruthy();

    // The user writes.
    await loginViaUI(page, username, password);
    await page.getByTestId('support-button').click();
    const input = page.getByTestId('support-input');
    await input.fill('Hello, I need help');
    await input.press('Enter');
    await expect(page.getByTestId('support-message-own').filter({ hasText: 'Hello, I need help' })).toBeVisible();
    // Shift+Enter is a newline, not a send.
    await input.fill('line one');
    await input.press('Shift+Enter');
    await input.type('line two');
    await expect(input).toHaveValue('line one\nline two');
    await input.fill('');
    // Close the drawer so the unread badge (not the open-drawer poll) is what delivers the reply.
    await page.keyboard.press('Escape');

    // The admin sees the thread and replies.
    const adminContext = await browser.newContext({ baseURL });
    try {
      const adminPage = await adminContext.newPage();
      await loginViaUI(adminPage);
      await adminPage.goto('/admin');
      await adminPage.getByRole('menuitem', { name: /User support/ }).click();
      const thread = adminPage.getByTestId(`support-thread-${username}`);
      await expect(thread).toBeVisible();
      await expect(thread).toContainText('Hello, I need help');
      await thread.click();
      await expect(adminPage.getByTestId('support-conversation')).toContainText('Hello, I need help');
      const reply = adminPage.getByTestId('support-reply-input');
      await reply.fill('Hi, how can we help?');
      await reply.press('Enter');
      await expect(adminPage.getByTestId('support-conversation')).toContainText('Hi, how can we help?');
    } finally {
      await adminContext.close();
    }

    // The user sees the badge (unread poll: up to 60s), then the reply in the drawer.
    await expect(page.locator('.ant-badge-count').first()).toBeVisible({ timeout: 90_000 });
    await page.getByTestId('support-button').click();
    await expect(page.getByTestId('support-message-admin').filter({ hasText: 'Hi, how can we help?' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.ant-badge-count')).toHaveCount(0, { timeout: 15_000 });
  });
});
