import { test, expect } from './fixtures.js';
import {
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';
import { buildFunctionNode, buildLogNode } from './node-builders.js';

/**
 * Browser-tier smoke spec for ADR 0025 (private)'s history panel + diff view
 * (package D) — proves the UI wiring only: the toolbar's "History" button opens the panel, "Commit"
 * creates a named version and it shows up in the list, editing the document afterward surfaces
 * "Changes since last commit", and "Compare" opens the split diff view with a real
 * `.block-body.diff-added` node visible on the right canvas. The commit/diff/restore *mechanism*
 * itself is proven server-side by `@falang/workflow-backend`'s own `versioning.e2e.test.ts` (in-memory
 * sqlite) and `versioning.workflow-e2e-spec.ts` (package C, no browser involved).
 *
 * Like `debugger-smoke.spec.ts`, the function's body statements are seeded through the API rather
 * than placed via canvas drag/drop — automating canvas node placement is out of scope for this suite
 * (see `node-builders.ts`'s own doc comment); only the interactions unique to this ADR (the History
 * button, the commit form, the diff modal) are driven through the real UI.
 *
 * Auto-versions are session-gap based (ADR 0025 (private), "Correction to
 * decision 2 (2026-09-18)"), not a client-side `beforeunload` beacon — a NestJS interceptor on the
 * receiving side of every mutating `documents`/`folders` write auto-commits the *pre-edit* working
 * copy whenever the project's previous edit was more than the configured gap ago (or never recorded
 * at all). This test's own first API `PATCH` below is effectively the project's first mutating write
 * (right after `createTreeItemViaUI` creates the document), so it — or the document creation just
 * before it — trips that "never recorded" case and auto-commits the pre-edit state server-side, well
 * before "Initial version" is ever typed into the panel.
 */
test.describe('version history', () => {
  test('commits a named version, shows changes since last commit, and opens the diff view', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAndReachProjectList(page);
    const projectName = `Version history smoke ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const functionId = await createTreeItemViaUI(page, 'function', 'greet');

    const logNodeId = `${functionId}-log`;
    const api = await createApiContext();
    await api.patch(`/projects/${projectId}/documents/${functionId}`, {
      data: { root: buildFunctionNode(functionId, [buildLogNode(logNodeId, 'hello')]) },
    });

    await page.reload();
    await openProjectViaUI(page, projectName);
    // `openProjectViaUI` only enters the project workspace (the tree) — the reload above closed
    // whatever tab `createTreeItemViaUI` had opened, so the function's own scheme editor needs a
    // fresh click to render the canvas (and the toolbar's "History" button) at all.
    await page.getByRole('treeitem', { name: 'greet' }).click();

    await page.getByRole('button', { name: 'History' }).first().click();
    await page.getByPlaceholder('What changed?').fill('Initial version');
    // The primary action's label depends on `VersionHistoryStore.dirty`: "Commit" when the working
    // copy differs from `HEAD`, "Name current version" otherwise. There's no client-side beacon any
    // more to make this deterministic one way — but it lands on "Commit" regardless: the session-gap
    // auto-commit described in this file's own top comment snapshots the state *before* the API
    // `PATCH` (no function-body content yet), so once this panel opens, `HEAD` is that earlier,
    // content-less auto commit and the current working copy (with the log node) is still dirty
    // against it. Matching both labels keeps this robust to that auto-commit not firing for some
    // reason (e.g. a already-non-null `last_edited_at` in a re-run) — both drive the exact same
    // `commitNamed()` action (`version-history.store.ts`). Not `exact`/anchored: this button carries
    // an icon (`HistoryOutlined`) whose own accessible name prefixes the button's computed name
    // (AntD renders it as e.g. "history Name current version" per a real Playwright snapshot taken
    // against this exact failure), the same reason every other toolbar locator in this file
    // (`'History'`, `'Runs'`, …) already matches by substring, not `exact`.
    await page.getByRole('button', { name: /Commit|Name current version/ }).click();
    await expect(page.getByText('Initial version')).toBeVisible();

    // The session-gap auto-commit from before "Initial version" was named is still in history,
    // just hidden by default (it isn't `HEAD` any more — "Initial version" is) — toggling "Show
    // auto-saved versions" reveals it, proving the interceptor really did fire server-side.
    await page.getByRole('switch').click();
    await expect(page.getByText(/^Auto-save \d{4}-\d{2}-\d{2}/)).toBeVisible();
    await page.getByRole('switch').click();

    // Add a second body statement — a real, id-addressable added node for the diff view to highlight.
    const secondLogNodeId = `${functionId}-log-2`;
    await api.patch(`/projects/${projectId}/documents/${functionId}`, {
      data: {
        root: buildFunctionNode(functionId, [buildLogNode(logNodeId, 'hello'), buildLogNode(secondLogNodeId, 'world')]),
      },
    });
    await api.dispose();

    // Deliberately not a `page.reload()` here (unlike the first round-trip above): there's no
    // client-side auto-commit trigger left to worry about, but this second `PATCH` lands well within
    // the session-gap window of the first (no gap → no server-side auto-commit either), so the panel
    // staying open across it is exactly what should make it show up as a real, un-committed change.
    // `VersionHistoryPanel`
    // reads the working copy straight from the server (`getWorkingCopy()`), so the panel doesn't need
    // a reload to see the API patch above — only a fresh `refresh()`, which `toggleRightPanel('history')`
    // already fires on open (`workflow-store.ts`). Close then reopen the panel to trigger it.
    await page.getByRole('button', { name: 'History' }).first().click();
    await page.getByRole('button', { name: 'History' }).first().click();

    await expect(page.getByText('Changes since last commit')).toBeVisible();
    await page.getByRole('button', { name: 'Compare', exact: true }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.block-body.diff-added')).toBeVisible();
  });
});
