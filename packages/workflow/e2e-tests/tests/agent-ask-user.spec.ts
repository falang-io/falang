import type { INode } from '@falang/dto';
import { getOpenAiRequests, queueOpenAiToolCalls, resetOpenAiMock } from '@falang/workflow-mocks';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './fixtures.js';
import {
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';
import { MOCKS_URL, uniqueSuffix, waitForCondition } from './integration-test-helpers.js';
import { buildFunctionNode } from './node-builders.js';

interface IDocumentDto {
  readonly id: string;
  readonly root?: INode;
}

interface IOpenAiRequest {
  readonly messages: readonly {
    readonly role: string;
    readonly content: string | null;
    readonly tool_calls?: readonly { readonly function: { readonly name: string } }[];
  }[];
  readonly tools?: readonly { readonly function: { readonly name: string } }[];
}

const PLACEHOLDER = 'Describe what the agent should change, or ask a question…';

const fetchBodyLogMessages = async (api: APIRequestContext, projectId: string, id: string): Promise<string[]> => {
  const response = await api.get(`/projects/${projectId}/documents`);
  const docs = (await response.json()) as IDocumentDto[];
  return (
    docs.find((doc) => doc.id === id)?.root?.children?.find((child) => child.name === 'function-body')?.children ?? []
  )
    .filter((child) => child.name === 'log')
    .map((child) => String(child.data));
};

/**
 * Browser-tier spec for ADR 0047 (private): the agent's `ask_user` tool ends a run in an "awaiting answer"
 * state, the chat panel shows the question with option buttons, and clicking one starts a continuation run
 * that reuses the full in-memory message history (not the condensed one). LLM vendor: the mocks service.
 */
test.describe('agent clarifying questions', () => {
  test('asks, is answered by an option button, and continues with the full history', async ({ page }) => {
    test.setTimeout(90_000);
    const apiKey = `agent-ask-${uniqueSuffix()}`;
    const api = await createApiContext();
    try {
      await resetOpenAiMock(MOCKS_URL, apiKey);
      const settings = await api.put('/admin/settings/agent', {
        data: { apiKey, baseUrl: `${MOCKS_URL}/openai`, model: 'mock-model' },
      });
      expect(settings.ok()).toBeTruthy();

      await loginAndReachProjectList(page);
      const projectName = `Agent ask ${Date.now()}`;
      const projectId = await createProjectViaUI(page, projectName);
      const mainId = await createTreeItemViaUI(page, 'function', 'main');
      await api.patch(`/projects/${projectId}/documents/${mainId}`, { data: { root: buildFunctionNode(mainId) } });

      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
        {
          arguments: {
            options: [
              { description: 'Log to the console', label: 'Console' },
              { description: 'Log to a file', label: 'File' },
            ],
            question: 'Where should the message go?',
          },
          name: 'ask_user',
        },
      ]);

      await page.reload();
      await openProjectViaUI(page, projectName);
      await page.getByRole('treeitem', { name: 'main' }).click();
      await page.getByRole('button', { name: 'Agent' }).click();
      const agentPanel = page.locator('.agent-chat-panel');
      const input = agentPanel.locator('textarea');
      await input.fill('Log a greeting');
      await agentPanel.getByRole('button', { name: 'Send' }).click();

      await expect(agentPanel.getByText('Where should the message go?')).toBeVisible({ timeout: 30_000 });
      await expect(agentPanel.getByRole('button', { name: /Console/ })).toBeVisible();
      const fileOption = agentPanel.getByRole('button', { name: /File/ });
      await expect(fileOption).toBeVisible();
      await expect(agentPanel.getByRole('button', { name: 'Decide yourself' })).toBeVisible();
      await expect(input).toBeDisabled();

      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
        {
          arguments: { data: 'hello file', index: 0, name: 'log', parentId: `${mainId}-body` },
          name: 'insert_node',
        },
      ]);
      const reply = 'Logged hello to a file.';
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [{ arguments: { message: reply }, name: 'finish' }]);
      await fileOption.click();

      await expect(agentPanel.getByText(reply)).toBeVisible({ timeout: 30_000 });
      await expect(input).toBeEnabled();
      await waitForCondition(async () => {
        const logs = await fetchBodyLogMessages(api, projectId, mainId);
        return logs.includes('hello file');
      }, 20_000);

      const requests = (await getOpenAiRequests(MOCKS_URL, apiKey)) as readonly IOpenAiRequest[];
      expect(requests).toHaveLength(3);
      const continuation = requests[1].messages;
      const askIndex = continuation.findIndex((m) => m.tool_calls?.some((c) => c.function.name === 'ask_user'));
      expect(askIndex).toBeGreaterThan(0);
      expect(continuation[askIndex + 1].role).toBe('tool');
      expect(continuation.at(-1)).toMatchObject({ content: 'Answer: File', role: 'user' });
    } finally {
      await api.delete('/admin/settings/agent').catch(() => {
        // best-effort cleanup
      });
      await resetOpenAiMock(MOCKS_URL, apiKey).catch(() => {
        // best-effort cleanup
      });
      await api.dispose();
    }
  });

  test('"Don\'t ask, just do" removes ask_user from the offered tools', async ({ page }) => {
    test.setTimeout(90_000);
    const apiKey = `agent-noask-${uniqueSuffix()}`;
    const api = await createApiContext();
    try {
      await resetOpenAiMock(MOCKS_URL, apiKey);
      const settings = await api.put('/admin/settings/agent', {
        data: { apiKey, baseUrl: `${MOCKS_URL}/openai`, model: 'mock-model' },
      });
      expect(settings.ok()).toBeTruthy();

      await loginAndReachProjectList(page);
      const projectName = `Agent noask ${Date.now()}`;
      await createProjectViaUI(page, projectName);
      await createTreeItemViaUI(page, 'function', 'main');
      const reply = 'Nothing to do.';
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [{ arguments: { message: reply }, name: 'finish' }]);

      await page.getByRole('button', { name: 'Agent' }).click();
      const agentPanel = page.locator('.agent-chat-panel');
      await agentPanel.getByRole('switch').click();
      await agentPanel.getByPlaceholder(PLACEHOLDER).fill('Do something');
      await agentPanel.getByRole('button', { name: 'Send' }).click();
      await expect(agentPanel.getByText(reply)).toBeVisible({ timeout: 30_000 });

      const requests = (await getOpenAiRequests(MOCKS_URL, apiKey)) as readonly IOpenAiRequest[];
      const names = (requests[0].tools ?? []).map((tool) => tool.function.name);
      expect(names).toContain('finish');
      expect(names).not.toContain('ask_user');
    } finally {
      await api.delete('/admin/settings/agent').catch(() => {
        // best-effort cleanup
      });
      await resetOpenAiMock(MOCKS_URL, apiKey).catch(() => {
        // best-effort cleanup
      });
      await api.dispose();
    }
  });
});
