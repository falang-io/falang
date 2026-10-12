import { randomUUID } from 'node:crypto';
import { getOpenAiRequests, queueOpenAiToolCalls, resetOpenAiMock } from '@falang/workflow-mocks';
import { test, expect } from './fixtures.js';
import { createApiContext, createProjectViaUI, loginAndReachProjectList, loginViaUI } from './fixtures.js';
import { MOCKS_URL, uniqueSuffix } from './integration-test-helpers.js';

interface IOpenAiRequest {
  readonly messages: readonly { readonly role: string; readonly content: string | null }[];
}

/**
 * Starting with the agent: an empty project opens with the agent panel showing, and a user with no projects gets a
 * "What new automation do you want to build?" box — Enter creates "New project", opens it and runs the agent on the
 * text. LLM vendor: the mocks service.
 */
test.describe('agent first start', () => {
  test('the empty project list starts a new project with the agent working on the prompt', async ({ page }) => {
    test.setTimeout(90_000);
    const apiKey = `agent-first-${uniqueSuffix()}`;
    const api = await createApiContext();
    try {
      await resetOpenAiMock(MOCKS_URL, apiKey);
      const settings = await api.put('/admin/settings/agent', {
        data: { apiKey, baseUrl: `${MOCKS_URL}/openai`, interface: 'nodes', model: 'mock-model' },
      });
      expect(settings.ok()).toBeTruthy();
      const created = await api.post('/admin/users', { data: { username: `first-start-${uniqueSuffix()}` } });
      expect(created.ok()).toBeTruthy();
      const user = (await created.json()) as { username: string; password: string };

      const reply = 'Let us build that bot.';
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [{ arguments: { message: reply }, name: 'finish' }]);

      await loginViaUI(page, user.username, user.password);
      const prompt = 'A Telegram bot that answers hello';
      const input = page.getByTestId('start-with-agent-input');
      await expect(page.getByText('What new automation do you want to build?')).toBeVisible();
      await input.fill(prompt);
      const [createResponse] = await Promise.all([
        page.waitForResponse((res) => res.url().endsWith('/projects') && res.request().method() === 'POST'),
        input.press('Enter'),
      ]);
      const project = (await createResponse.json()) as { id: string; name: string };
      expect(project.name).toBe('New project');

      await expect(page.getByRole('button', { name: '+ Add', exact: true })).toBeVisible();
      const agentPanel = page.locator('.agent-chat-panel');
      await expect(agentPanel).toBeVisible();
      // The prompt is both the session's title and the turn's request.
      await expect(agentPanel.getByText(prompt).last()).toBeVisible();
      await expect(agentPanel.getByText(reply)).toBeVisible({ timeout: 30_000 });

      const requests = (await getOpenAiRequests(MOCKS_URL, apiKey)) as readonly IOpenAiRequest[];
      expect(requests).toHaveLength(1);
      expect(requests[0].messages.some((m) => m.role === 'user' && m.content?.includes(prompt))).toBe(true);
    } finally {
      await api.delete('/admin/settings/agent').catch(() => {
        // Best-effort cleanup.
      });
      await api.dispose();
    }
  });

  test('an empty project opens with the agent panel, a non-empty one without it', async ({ page }) => {
    test.setTimeout(60_000);
    const api = await createApiContext();
    try {
      const settings = await api.put('/admin/settings/agent', {
        data: {
          apiKey: `agent-open-${uniqueSuffix()}`,
          baseUrl: `${MOCKS_URL}/openai`,
          interface: 'nodes',
          model: 'mock-model',
        },
      });
      expect(settings.ok()).toBeTruthy();

      await loginAndReachProjectList(page);
      const projectId = await createProjectViaUI(page, `Agent auto open ${Date.now()}`);
      await expect(page.locator('.agent-chat-panel')).toBeVisible();

      // `folderId: null` puts a document into its type's section.
      const doc = await api.post(`/projects/${projectId}/documents`, {
        data: { folderId: null, id: randomUUID(), name: 'main', type: 'function' },
      });
      expect(doc.ok()).toBeTruthy();
      // The panel decision is taken once the tree, the documents and the agent status have loaded.
      await Promise.all([
        page.waitForResponse((res) => res.url().endsWith('/agent/settings')),
        page.waitForResponse((res) => res.url().endsWith(`/projects/${projectId}/documents`)),
        page.reload(),
      ]);
      await expect(page.getByRole('treeitem', { name: 'main' })).toBeVisible();
      await expect(page.locator('.agent-chat-panel')).toHaveCount(0);
    } finally {
      await api.delete('/admin/settings/agent').catch(() => {
        // Best-effort cleanup.
      });
      await api.dispose();
    }
  });
});
