import { test, expect } from './fixtures.js';
import {
  clickProjectMenuItem,
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';
import { waitForCondition } from './integration-test-helpers.js';
import { buildFunctionNode, buildLogNode } from './node-builders.js';

/**
 * Browser-tier UI smoke for ADR 0059 (private)'s run journal — only the chrome: the Runs page's run detail
 * drawer opens on the Journal tab with rows, the "Whole conversation" toggle flips, and the "Run journal"
 * settings modal opens from the Project menu. What the journal actually records (kinds, node ids, usage, the
 * text policy, errors) is proven without a browser by `run-journal.workflow-e2e-spec.ts` (`@falang/workflow-backend`).
 * Build and run are driven through the API (as in `tasks-page.spec.ts`) — the canvas is not under test here.
 */
test.describe('run journal', () => {
  test('run detail drawer shows the journal (default tab), the whole-conversation toggle works, and the settings modal opens', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await loginAndReachProjectList(page);
    const projectName = `Run journal smoke ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const functionName = 'journalSmoke';
    const functionId = await createTreeItemViaUI(page, 'function', functionName);

    const api = await createApiContext();
    try {
      await api.patch(`/projects/${projectId}/documents/${functionId}`, {
        data: { root: buildFunctionNode(functionId, [buildLogNode(`${functionId}-log`, 'journal smoke line')]) },
      });
      const buildResponse = await api.post(`/projects/${projectId}/build`);
      expect(buildResponse.ok()).toBe(true);
      await waitForCondition(async () => {
        const status = (await api.get(`/projects/${projectId}/build/status`).then((response) => response.json())) as {
          running?: boolean;
        };
        if (status.running) return status;
      }, 60_000);

      const runResponse = await api.post(`/projects/${projectId}/runs`, { data: { functionName, args: [] } });
      expect(runResponse.ok()).toBe(true);

      // The entry is written asynchronously by the runner: wait until the API has it before opening the UI.
      await waitForCondition(async () => {
        const runs = (await api
          .get(`/workflow-runs?projectId=${projectId}`)
          .then((response) => response.json())) as readonly { workflowId: string; runId: string }[];
        const run = runs[0];
        if (!run) return null;
        const journal = (await api
          .get(
            `/projects/${projectId}/runs/${encodeURIComponent(run.workflowId)}/${encodeURIComponent(run.runId)}/journal`,
          )
          .then((response) => response.json())) as { entries?: readonly { kind: string }[] };
        return journal.entries?.some((entry) => entry.kind === 'log') ? journal : null;
      }, 60_000);
    } finally {
      await api.dispose();
    }

    // The global Runs page (hash route `#/runs`) — a row opens the run detail drawer.
    await page.evaluate(() => {
      globalThis.location.hash = '#/runs';
    });
    await page
      .getByRole('row', { name: new RegExp(functionName) })
      .first()
      .click();

    const journalTab = page.getByTestId('run-journal-tab');
    await expect(journalTab).toBeVisible();
    await expect(page.getByTestId('run-journal')).toBeVisible();
    const rows = page.getByTestId('run-journal-row');
    await expect(rows.first()).toBeVisible();
    await expect(page.locator('[data-testid="run-journal-row"][data-kind="log"]').first()).toContainText(
      'journal smoke line',
    );

    // "Whole conversation" flips to "This run only" and the list stays populated.
    const toggle = page.getByTestId('run-journal-whole-conversation');
    const labelBefore = (await toggle.textContent()) ?? '';
    await toggle.click();
    await expect(toggle).not.toHaveText(labelBefore);
    await expect(rows.first()).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveText(labelBefore);

    // Back to the project: the Project menu's "Run journal" opens the settings modal with the switch.
    await page.keyboard.press('Escape');
    await page.goto('/');
    await openProjectViaUI(page, projectName);
    await clickProjectMenuItem(page, 'Run journal');
    // antd puts `data-testid` on the zero-size modal root, so assert the dialog and its switch instead.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('run-journal-store-texts')).toBeVisible();
  });
});
