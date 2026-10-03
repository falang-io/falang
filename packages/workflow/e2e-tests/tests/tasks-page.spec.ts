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
import { buildFunctionNode, buildHumanTaskNode, buildReturnNode } from './node-builders.js';

/**
 * Browser-tier smoke spec for ADR 0040 (private)'s Tasks page — proves
 * the UI wiring only: the workspace toolbar's "Tasks" button opens the embedded Tasks view, a task
 * row opens the detail drawer, picking a typed (`dataType: 'string'`) option's button reveals its
 * input and resolving it flips the row to `done`, and the project list's own standalone "Tasks"
 * button shows the same task. The actual `human-task` compiler/runtime mechanism (ask -> real
 * Temporal wait -> `POST /tasks/:id/resolve` signalling the exact run -> branch with typed data) is
 * proven for real, no browser, by `tasks.workflow-e2e-spec.ts` (`@falang/workflow-backend`) — this
 * spec only proves the canvas-adjacent chrome around it.
 *
 * Like `debugger-smoke.spec.ts`/`build-and-run.spec.ts`, the function's body (the `human-task` node
 * itself) is seeded through the API rather than placed via canvas drag/drop — automating canvas node
 * placement is out of scope for this suite (see `node-builders.ts`'s own doc comment) — and build +
 * "Run now" are also driven directly through the API (`POST /projects/:id/build` /
 * `POST /projects/:id/runs`) rather than the toolbar's "Dev" dropdown + "Run function" modal, since
 * only the Tasks-page-specific interactions need a real browser here.
 */
test.describe('tasks page', () => {
  test("resolves a human-task from the workspace Tasks view, and the project list's own Tasks button shows it too", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await loginAndReachProjectList(page);
    const projectName = `Tasks page smoke ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const functionId = await createTreeItemViaUI(page, 'function', 'approveOrder');

    const api = await createApiContext();
    try {
      await api.patch(`/projects/${projectId}/documents/${functionId}`, {
        data: {
          root: buildFunctionNode(
            functionId,
            [
              buildHumanTaskNode(`${functionId}-task`, { title: 'Approve order', description: 'Amount: 100' }, [
                { label: 'Approve', dataType: 'void', children: [buildReturnNode(`${functionId}-r1`, "'approve'")] },
                {
                  label: 'Reject',
                  dataType: 'string',
                  prompt: 'Reason',
                  children: [buildReturnNode(`${functionId}-r2`, 'data')],
                },
              ]),
            ],
            { type: 'any' },
          ),
        },
      });

      const buildResponse = await api.post(`/projects/${projectId}/build`);
      expect(buildResponse.ok()).toBe(true);
      await waitForCondition(async () => {
        const status = (await api.get(`/projects/${projectId}/build/status`).then((response) => response.json())) as {
          running?: boolean;
        };
        if (status.running) return status;
      }, 60_000);

      const runResponse = await api.post(`/projects/${projectId}/runs`, {
        data: { functionName: 'approveOrder', args: [] },
      });
      expect(runResponse.ok()).toBe(true);

      // Wait for the real ask activity to create the task row before touching the UI at all — the
      // Tasks view's own 30s background refresh (`TasksStore`) shouldn't have to be relied on for
      // this first render.
      await waitForCondition(async () => {
        const tasks = (await api.get('/tasks').then((response) => response.json())) as readonly {
          readonly id: string;
          readonly title: string;
          readonly projectId: string;
        }[];
        return tasks.find((task) => task.projectId === projectId && task.title === 'Approve order');
      }, 60_000);
    } finally {
      await api.dispose();
    }

    await page.reload();
    await openProjectViaUI(page, projectName);

    await clickProjectMenuItem(page, 'Tasks');
    await expect(page.getByRole('cell', { name: 'Approve order', exact: true })).toBeVisible();
    await page.getByRole('cell', { name: 'Approve order', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
    await page.getByRole('button', { name: 'Reject' }).click();
    await page.getByPlaceholder('Reason').fill('too expensive');
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Once resolved, the whole "Resolve" section (including "Confirm") disappears — `status !== 'open'`.
    await expect(page.getByRole('button', { name: 'Confirm' })).not.toBeVisible();
    await page.keyboard.press('Escape');

    // The workspace Tasks view is already scoped to this project (and has no project column).
    const row = page.getByRole('row', { name: /Approve order/ });
    await expect(row.getByText('done')).toBeVisible();

    // The project list's own standalone "Tasks" button (`navigationStore.goToTasks()`) shows the
    // same task, cross-project.
    await page.getByRole('button', { name: '← Projects' }).click();
    await expect(page.getByRole('button', { name: '+ New project' })).toBeVisible();
    await page.getByRole('button', { name: 'Tasks', exact: true }).click();
    const standaloneRow = page.getByRole('row', { name: new RegExp(`Approve order.*${projectName}`) });
    await expect(standaloneRow).toBeVisible();
    await expect(standaloneRow.getByText('done')).toBeVisible();
  });
});
