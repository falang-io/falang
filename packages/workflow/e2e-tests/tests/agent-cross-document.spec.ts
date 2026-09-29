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
  readonly name: string;
  readonly root?: INode;
}

interface IOpenAiRequest {
  readonly messages: readonly { readonly role: string; readonly content: string | null }[];
}

const bodyLogMessages = (doc: IDocumentDto | null | undefined): string[] =>
  (doc?.root?.children?.find((child) => child.name === 'function-body')?.children ?? [])
    .filter((child) => child.name === 'log')
    .map((child) => String(child.data));

/** The `log` messages in document `id`'s function body, as currently stored on the backend. */
const fetchBodyLogMessages = async (api: APIRequestContext, projectId: string, id: string): Promise<string[]> => {
  const response = await api.get(`/projects/${projectId}/documents`);
  const docs = (await response.json()) as IDocumentDto[];
  return bodyLogMessages(docs.find((doc) => doc.id === id));
};

const fetchLockCount = async (api: APIRequestContext, projectId: string): Promise<number> => {
  const response = await api.get(`/projects/${projectId}/documents/locks`);
  const locks = (await response.json()) as unknown[];
  return locks.length;
};

/**
 * Browser-tier spec for ADR 0034 (private), the follow-up its
 * "Implementation notes (2026-09-22)" left open: the tool-calling loop (`AgentSession`, the document
 * resolver, the lock tracker, `DocumentToolProvider`) runs client-side in the browser, so only this tier
 * can exercise it. The LLM vendor is the mocks service's OpenAI-compatible endpoint, scripted turn by
 * turn (`queueOpenAiToolCalls`); `backend` proxies to it exactly as it would to a real vendor. One run:
 * a tool call with truncated JSON arguments (comes back as an error step, nothing applied), an edit to
 * a document with no open tab (`documentId` — its tab opens), an edit to the open one (no `documentId`),
 * `create_document`, then `finish`. Then: both edits persisted, every agent lock released, and Undo on
 * one document reverts only that document's edit (one undo group per document touched).
 */
test.describe('agent cross-document editing', () => {
  test('edits two documents and creates a third through a scripted vendor', async ({ page }) => {
    test.setTimeout(90_000);
    const apiKey = `agent-e2e-${uniqueSuffix()}`;
    const api = await createApiContext();
    try {
      // App-wide agent config (ADR 0031), pointed at the mocks service — set before the project opens,
      // since the chat panel reads it once per workspace mount.
      await resetOpenAiMock(MOCKS_URL, apiKey);
      const settings = await api.put('/admin/settings/agent', {
        data: { apiKey, baseUrl: `${MOCKS_URL}/openai`, model: 'mock-model' },
      });
      expect(settings.ok()).toBeTruthy();

      await loginAndReachProjectList(page);
      const projectName = `Agent cross-document ${Date.now()}`;
      const projectId = await createProjectViaUI(page, projectName);
      const mainId = await createTreeItemViaUI(page, 'function', 'main');
      const helperId = await createTreeItemViaUI(page, 'function', 'helper');
      // Known body ids (`<id>-body`) for the scripted tool calls to target.
      for (const id of [mainId, helperId]) {
        // oxlint-disable-next-line no-await-in-loop
        await api.patch(`/projects/${projectId}/documents/${id}`, { data: { root: buildFunctionNode(id) } });
      }

      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
        { arguments: `{"parentId":"${helperId}-body","index":0,"name":"log","da`, name: 'insert_node' },
      ]);
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
        {
          arguments: {
            data: 'from agent in helper',
            documentId: helperId,
            index: 0,
            name: 'log',
            parentId: `${helperId}-body`,
          },
          name: 'insert_node',
        },
      ]);
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
        {
          arguments: { data: 'from agent in main', index: 0, name: 'log', parentId: `${mainId}-body` },
          name: 'insert_node',
        },
      ]);
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
        { arguments: { name: 'agentCreated', type: 'function' }, name: 'create_document' },
      ]);
      const reply = 'Added a log to helper and main, and created agentCreated.';
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [{ arguments: { message: reply }, name: 'finish' }]);

      // Tabs aren't persisted across a reload: only `main` gets opened, `helper` has no tab.
      await page.reload();
      await openProjectViaUI(page, projectName);
      await page.getByRole('treeitem', { name: 'main' }).click();
      await expect(page.getByRole('tab', { name: 'main' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tab', { name: 'helper' })).toHaveCount(0);

      await page.getByRole('button', { name: 'Agent' }).click();
      const agentPanel = page.locator('.agent-chat-panel');
      await agentPanel
        .getByPlaceholder('Describe what the agent should change, or ask a question…')
        .fill('Add a log to helper and main, and create a new function');
      await agentPanel.getByRole('button', { name: 'Send' }).click();

      await expect(agentPanel.getByText(reply)).toBeVisible({ timeout: 30_000 });
      await expect(agentPanel.getByText('5 steps')).toBeVisible();
      await agentPanel.getByText('5 steps').click();
      await expect(agentPanel.getByText('error', { exact: true })).toHaveCount(1);

      // The truncated-JSON call was answered with a parse error, not run on an empty input.
      const requests = (await getOpenAiRequests(MOCKS_URL, apiKey)) as readonly IOpenAiRequest[];
      expect(requests).toHaveLength(5);
      const firstToolResult = requests[1]?.messages.find((message) => message.role === 'tool');
      expect(firstToolResult?.content).toContain('not valid JSON');

      // Touching `helper` opened its tab; `create_document` opened (and activated) the new one.
      await expect(page.getByRole('tab', { name: 'helper' })).toHaveCount(1);
      await expect(page.getByRole('tab', { name: 'agentCreated' })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('treeitem', { name: 'agentCreated' })).toBeVisible();

      // Both edits reach the backend through the tab's own autosave (with its lock owner), and the
      // run's locks are released once it finishes.
      await waitForCondition(async () => {
        const helperLogs = await fetchBodyLogMessages(api, projectId, helperId);
        const mainLogs = await fetchBodyLogMessages(api, projectId, mainId);
        const lockCount = await fetchLockCount(api, projectId);
        return (
          helperLogs.includes('from agent in helper') && mainLogs.includes('from agent in main') && lockCount === 0
        );
      }, 20_000);

      // One undo group per document: Undo on `main` reverts only `main`'s edit.
      await page.getByRole('tab', { name: 'main' }).click();
      await agentPanel.getByRole('button', { name: 'Undo' }).click();
      await waitForCondition(async () => {
        const mainLogs = await fetchBodyLogMessages(api, projectId, mainId);
        const helperLogs = await fetchBodyLogMessages(api, projectId, helperId);
        return mainLogs.length === 0 && helperLogs.includes('from agent in helper');
      }, 20_000);
    } finally {
      await api.delete('/admin/settings/agent').catch(() => {
        // best-effort cleanup — a failure here shouldn't mask the test's own assertion failures
      });
      await resetOpenAiMock(MOCKS_URL, apiKey).catch(() => {
        // best-effort cleanup
      });
      await api.dispose();
    }
  });
});
