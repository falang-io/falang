import { test, expect } from './fixtures.js';
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
 * Browser-only smoke test for the visual debugger (ADR 0021 (private), Phase 1's
 * verification requirement). The actual debugging *mechanism* — breakpoints, pause, scope variables,
 * step-over, resume — is proven for real against Temporal + a k8s runner pod by the workflow-tier
 * `build-and-debug.workflow-e2e-spec.ts` (`@falang/workflow-backend`), no browser involved. What's
 * left here only proves the canvas UI itself: a right-click on a statement icon offers "Add
 * breakpoint", toggling it renders the red dot (`.debug-breakpoint`), and starting a session pans to
 * and highlights the paused node (`.debug-current`) — the same two things ADR 0021's own Phase 0
 * playground pass already verified manually for the shared `@falang/scheme` module before any
 * product wired a real transport to it.
 *
 * Like `build-and-run.spec.ts`, the function's body statement is seeded through the API rather than
 * placed via canvas drag/drop (`node-builders.ts`'s own doc comment: "automating canvas node
 * placement is out of scope") — only the interactions unique to this ADR (right-clicking the
 * resulting icon, reading the debug panel) are driven through the real UI. Icons carry no stable
 * `data-*`/id attribute of their own (only a *breakpoint dot*, once one exists, has `data-node-id`
 * — see `breakpoints.layer.tsx`), so the pre-breakpoint icon is located via its rendered content
 * instead: `.block-container` (`block-view.tsx`'s `BlockContainer`) is a sibling of the icon's shape
 * `div` (`.block-body`, always childless — `ShapeView`'s own container) inside the same
 * `BlockEventsDiv`, absolutely positioned over the same rect and later in DOM order, so it's what
 * actually receives pointer events; `.block-body.nth(2)` (the statement's shape) resolves to a real
 * element but every click on it times out, since Playwright's actionability check refuses to click
 * an element whose own hit target isn't a descendant of the locator — the content div intercepts
 * it. `getByText(logMessage)` doesn't work either: the log node's message renders through
 * `TemplateStringViewComponent` → `CodeViewComponent` (Prism syntax highlighting), which splits the
 * string across several sibling `<span>` tokens, so no single element's own text content ever
 * equals the whole message. `filter({ hasText })` sidesteps that — it matches against the element's
 * full `textContent`, tokens and all.
 */
test.describe('visual debugger', () => {
  test('toggles a breakpoint from the canvas context menu, then pauses and resumes a real dev session on it', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await loginAndReachProjectList(page);
    const projectName = `Debugger smoke ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const functionId = await createTreeItemViaUI(page, 'function', 'greet');

    const logNodeId = `${functionId}-log`;
    const logMessage = 'before-breakpoint';
    const api = await createApiContext();
    await api.patch(`/projects/${projectId}/documents/${functionId}`, {
      data: { root: buildFunctionNode(functionId, [buildLogNode(logNodeId, logMessage)]) },
    });
    await api.dispose();

    await page.reload();
    await openProjectViaUI(page, projectName);
    // `openProjectViaUI` only enters the project workspace (the tree) — the reload above closed
    // whatever tab `createTreeItemViaUI` had opened, so the function's own scheme editor needs a
    // fresh click to render the canvas at all.
    await page.getByRole('treeitem', { name: 'greet' }).click();

    // The statement icon's content overlay (`.block-container`), not its shape (`.block-body`) —
    // see the file doc comment for why a shape/positional click times out and `getByText` can't be
    // used instead.
    const logIcon = page.locator('.block-container').filter({ hasText: logMessage });
    await expect(logIcon).toBeVisible();
    await logIcon.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add breakpoint' }).click();

    const breakpointDot = page.locator(`[data-node-id="${logNodeId}"]`);
    await expect(breakpointDot).toBeVisible();
    await expect(breakpointDot).toHaveClass(/debug-breakpoint/);
    // No session yet — the dot is hollow (see `BreakpointDot`'s `armed` prop).
    await expect(breakpointDot).not.toHaveClass(/armed/);

    await startDevRunnerViaUI(page, projectId);

    await page.getByRole('button', { name: 'Debug' }).click();

    // Pauses on the only breakpoint (the log statement is the function's first and only statement,
    // so `pauseOnEntry`'s own "no breakpoints yet" fallback never applies here).
    await expect(page.getByText('Paused')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('at a breakpoint')).toBeVisible();
    await expect(breakpointDot).toHaveClass(/armed/);
    // `debugger.module.ts`'s reaction sets this on the paused node and pans the canvas to it.
    await expect(page.locator('.debug-current')).toBeVisible();

    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Finished')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('completed')).toBeVisible();

    await stopDevRunnerViaUI(page, projectId);
  });
});
