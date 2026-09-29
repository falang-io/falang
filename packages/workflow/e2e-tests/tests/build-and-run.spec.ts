import { test } from './fixtures.js';
import {
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  loginAndReachProjectList,
  openProjectViaUI,
  startDevRunnerViaUI,
  stopDevRunnerViaUI,
} from './fixtures.js';
import { buildFunctionNode, buildLogNode } from './node-builders.js';

/**
 * Browser-only smoke test for the "Dev" toolbar (Build & Run/Stop) — see
 * ADR 0018 (private). The actual runtime proof (a compiled function
 * really runs on a real Temporal task queue through the built worker, including the cross-document
 * `call-function` case and the publish/prod-start path) moved to
 * `build-and-run.workflow-e2e-spec.ts` (`@falang/workflow-backend`), driven entirely through the
 * project-import API — no browser. What's left here only proves a user can build a project through
 * the actual canvas UI (project tree, "Dev" dropdown) and the toolbar's own status reporting reaches
 * "running"/"stopped" — `startDevRunnerViaUI`/`stopDevRunnerViaUI` already poll `backend`'s real
 * `/build/status` to confirm that, not just that the buttons were clicked.
 */
test.describe('build and run', () => {
  test('compiles a function document through the canvas UI and the "Dev" toolbar reports it running, then stopped', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await loginAndReachProjectList(page);
    const projectName = `Build & Run ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const functionId = await createTreeItemViaUI(page, 'function', 'greet');

    // Only the function's *body statements* are seeded through the API, mirroring exactly what a
    // user building this in the canvas would produce — see `@falang/workflow-e2e-tests`' own
    // convention (the canvas node editor's drag/drop isn't driven by this suite).
    const api = await createApiContext();
    await api.patch(`/projects/${projectId}/documents/${functionId}`, {
      data: { root: buildFunctionNode(functionId, [buildLogNode(`${functionId}-log`, 'hello')]) },
    });
    await api.dispose();

    await page.reload();
    await openProjectViaUI(page, projectName);

    await startDevRunnerViaUI(page, projectId);
    await stopDevRunnerViaUI(page, projectId);
  });
});
