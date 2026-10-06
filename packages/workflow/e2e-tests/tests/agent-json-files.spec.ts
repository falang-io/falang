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
import { buildFunctionNode, buildLogNode } from './node-builders.js';

interface IDocumentDto {
  readonly id: string;
  readonly root?: INode;
}

interface IOpenAiRequest {
  readonly messages: readonly { readonly role: string; readonly content: string | null }[];
}

interface ICheckProjectResponse {
  readonly diagnostics: readonly { readonly documentId?: string; readonly nodeId?: string; readonly message: string }[];
}

const fetchBodyLogMessages = async (api: APIRequestContext, projectId: string, id: string): Promise<string[]> => {
  const response = await api.get(`/projects/${projectId}/documents`);
  const docs = (await response.json()) as IDocumentDto[];
  const root = docs.find((doc) => doc.id === id)?.root;
  return (root?.children?.find((child) => child.name === 'function-body')?.children ?? [])
    .filter((child) => child.name === 'log')
    .map((child) => String(child.data));
};

/** The last tool result the agent was sent before the request at `index` (the mock records every request). */
const toolResultBefore = (requests: readonly IOpenAiRequest[], index: number): string =>
  requests[index]?.messages.findLast((message) => message.role === 'tool')?.content ?? '';

/**
 * Browser-tier spec for ADR 0062 (private): the in-app agent's JSON-file interface (the product default). The vendor
 * is scripted turn by turn; the run writes `functions/main.json` with a log message that interpolates an undefined
 * name, `check_project` (the backend's `POST /projects/:id/agent/check-project`, compiled in a build worker) reports
 * it against the log node, `edit_file` fixes it, the second check is clean, `finish`. Then the text is on the canvas,
 * reaches the backend, and each file write is one Undo step.
 */
test.describe('agent JSON files', () => {
  test('writes a document file, fixes a check_project error, each write is one undo step', async ({ page }) => {
    test.setTimeout(240_000);
    const apiKey = `agent-json-e2e-${uniqueSuffix()}`;
    const api = await createApiContext();
    try {
      await resetOpenAiMock(MOCKS_URL, apiKey);
      const settings = await api.put('/admin/settings/agent', {
        data: { apiKey, baseUrl: `${MOCKS_URL}/openai`, interface: 'json', model: 'mock-model' },
      });
      expect(settings.ok()).toBeTruthy();

      await loginAndReachProjectList(page);
      const projectName = `Agent JSON files ${Date.now()}`;
      const projectId = await createProjectViaUI(page, projectName);
      const mainId = await createTreeItemViaUI(page, 'function', 'main');
      await api.patch(`/projects/${projectId}/documents/${mainId}`, { data: { root: buildFunctionNode(mainId) } });

      // The endpoint itself, on the real stack: a clean project has no diagnostics.
      const clean = await api.post(`/projects/${projectId}/agent/check-project`, { data: { documents: [] } });
      expect(clean.ok()).toBeTruthy();
      expect(((await clean.json()) as ICheckProjectResponse).diagnostics).toEqual([]);

      const broken = 'Hello ${unknownName}';
      const written = buildFunctionNode(mainId, [buildLogNode('agent-log', broken)]);
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
        { arguments: { content: JSON.stringify(written, null, 2), path: 'functions/main.json' }, name: 'write_file' },
      ]);
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [{ arguments: {}, name: 'check_project' }]);
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
        {
          arguments: { new_string: 'Hello from the agent', old_string: broken, path: 'functions/main.json' },
          name: 'edit_file',
        },
      ]);
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [{ arguments: {}, name: 'check_project' }]);
      const reply = 'Added a greeting log to main.';
      await queueOpenAiToolCalls(MOCKS_URL, apiKey, [{ arguments: { message: reply }, name: 'finish' }]);

      await page.goto('/');
      await openProjectViaUI(page, projectName);
      await page.getByRole('treeitem', { name: 'main' }).click();
      await expect(page.getByRole('tab', { name: 'main' })).toHaveAttribute('aria-selected', 'true');

      await page.getByRole('button', { name: 'Agent' }).click();
      const agentPanel = page.locator('.agent-chat-panel');
      await agentPanel
        .getByPlaceholder('Describe what the agent should change, or ask a question…')
        .fill('Greet the user in main');
      await agentPanel.getByRole('button', { name: 'Send' }).click();

      // Two check_project calls each type-check in a build worker — slow on a loaded host.
      await expect(agentPanel.getByText(reply)).toBeVisible({ timeout: 150_000 });
      await agentPanel.getByText('5 steps').click();
      await expect(agentPanel.getByText('Wrote functions/main.json')).toBeVisible();
      await expect(agentPanel.getByText('Edited functions/main.json')).toBeVisible();
      await expect(agentPanel.getByText('Checked the project (compile + type check)')).toHaveCount(2);

      // The first check found the undefined name on the log node; the second one was clean.
      const requests = (await getOpenAiRequests(MOCKS_URL, apiKey)) as readonly IOpenAiRequest[];
      expect(requests).toHaveLength(5);
      const firstCheck = toolResultBefore(requests, 2);
      expect(firstCheck).toContain('unknownName');
      // A node written with an id the document never had gets a fresh one (ADR 0062 §2.2) — the error names the
      // log node by its kind and real id.
      expect(firstCheck).toContain('"kind":"log"');
      expect(firstCheck).toMatch(/"nodeId":"[\w-]+"/);
      expect(firstCheck).toContain('functions/main.json');
      expect(JSON.parse(toolResultBefore(requests, 4))).toEqual({ ok: true });

      // Visible on the canvas and saved through the tab's autosave.
      await expect(page.locator('.block-container').getByText('Hello from the agent')).toBeVisible();
      await waitForCondition(
        async () => (await fetchBodyLogMessages(api, projectId, mainId)).includes('Hello from the agent'),
        20_000,
      );

      // Every file write is one undo step: the first Undo reverts the edit, the second the write that added the log.
      await agentPanel.getByRole('button', { name: 'Undo' }).click();
      await waitForCondition(
        async () => (await fetchBodyLogMessages(api, projectId, mainId)).join() === broken,
        20_000,
      );
      await agentPanel.getByRole('button', { name: 'Undo' }).click();
      await waitForCondition(async () => (await fetchBodyLogMessages(api, projectId, mainId)).length === 0, 20_000);
      await expect(page.locator('.block-container').getByText('Hello from the agent')).toHaveCount(0);
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
