import { test as testBase, expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';
import MCR from 'monocart-coverage-reports';
import coverageOptions from '../mcr.config.e2e-browser.js';
import { waitForCondition } from './integration-test-helpers.js';

export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

/**
 * Collects browser (Chromium CDP) V8 coverage per test when `COLLECT_COVERAGE=true` — set only by
 * `npm run coverage:e2e` (root), not by a plain `npm test` run, so ordinary local/CI test runs pay
 * no extra overhead and don't leave `coverage-reports/` artifacts behind. See
 * ADR 0012 (private); every spec imports `test`/`expect` from here
 * instead of `@playwright/test` directly so this fixture applies to the whole suite.
 */
export const test = testBase.extend<{ collectCoverage: boolean }>({
  collectCoverage: [
    async ({ page }, use) => {
      const collect = process.env.COLLECT_COVERAGE === 'true';
      if (collect) {
        await Promise.all([
          page.coverage.startJSCoverage({ resetOnNavigation: false }),
          page.coverage.startCSSCoverage({ resetOnNavigation: false }),
        ]);
      }

      await use(collect);

      if (collect) {
        const [jsCoverage, cssCoverage] = await Promise.all([
          page.coverage.stopJSCoverage(),
          page.coverage.stopCSSCoverage(),
        ]);
        await MCR(coverageOptions).add([...jsCoverage, ...cssCoverage]);
      }
    },
    { scope: 'test', auto: true },
  ],
});

export { expect };

export const ADMIN_USERNAME = 'admin';
export const ADMIN_PASSWORD = 'admin';

/** Drives the real login form — used by tests that specifically exercise auth. */
export const loginViaUI = async (page: Page, username = ADMIN_USERNAME, password = ADMIN_PASSWORD): Promise<void> => {
  await page.goto('/');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: '+ New project' })).toBeVisible();
};

/**
 * `createApiContext()` (and therefore this) is called once per test plus once more per
 * `waitForDevRunnerStatus` call (`startDevRunnerViaUI`/`stopDevRunnerViaUI`), all against the same
 * `backend` origin — Node's global `fetch` (undici) pools keep-alive connections per origin, and
 * `backend`'s Express server advertises `Keep-Alive: timeout=5`. A gap longer than that between two
 * of these calls (routine given the UI interaction in between) leaves the pooled socket stale on the
 * client side: the next reuse throws `TypeError: fetch failed` / `Error: read ECONNRESET` — confirmed
 * by inspecting a captured Playwright trace of exactly this failure. One retry is enough: undici
 * drops the dead connection after the failed attempt and opens a fresh one for the retry. Same class
 * of transient error `waitForDevRunnerStatus` below already tolerates for its own polling fetches.
 */
export const getAdminToken = async (): Promise<string> => {
  const login = (): Promise<Response> =>
    fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
    });
  const response = await login().catch(() => login());
  const body = (await response.json()) as { accessToken: string };
  return body.accessToken;
};

/** An authenticated API client for seeding data the UI itself doesn't drive (see `node-builders.ts`). */
export const createApiContext = async (): Promise<APIRequestContext> => {
  const token = await getAdminToken();
  return pwRequest.newContext({ baseURL: BACKEND_URL, extraHTTPHeaders: { Authorization: `Bearer ${token}` } });
};

/** Every project gets one pinned `integrations` document auto-created alongside it (see ADR 0006) — this finds its id so credentials can be seeded via `PATCH .../documents/:id` like any other document. */
export const getIntegrationsDocumentId = async (api: APIRequestContext, projectId: string): Promise<string> => {
  const response = await api.get(`/projects/${projectId}/tree`);
  const body = (await response.json()) as { documents: readonly { id: string; type: string }[] };
  const doc = body.documents.find((item) => item.type === 'integrations');
  if (!doc) throw new Error(`Project ${projectId} has no pinned integrations document`);
  return doc.id;
};

/** Logs in and lands on the project list — the common starting point for most specs. */
export const loginAndReachProjectList = async (page: Page): Promise<void> => {
  await loginViaUI(page);
};

/** Creates a project through the "+ New project" modal and waits for it to be open (toolbar visible). Returns the new project's id. */
export const createProjectViaUI = async (page: Page, name: string): Promise<string> => {
  await page.getByRole('button', { name: '+ New project' }).click();
  await page.getByPlaceholder('Project name').fill(name);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().endsWith('/projects') && res.request().method() === 'POST'),
    page.getByRole('dialog').getByRole('button', { name: 'Create' }).click(),
  ]);
  const body = (await response.json()) as { id: string };
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  return body.id;
};

/** Opens a project from the project list by name. */
export const openProjectViaUI = async (page: Page, name: string): Promise<void> => {
  await page.getByText(name, { exact: true }).click();
  await expect(page.getByRole('button', { name: '+ Add' })).toBeVisible();
};

/** Opens the pinned "Integrations" document as a tab, so `IntegrationsEditor` renders. */
export const openIntegrationsViaUI = async (page: Page): Promise<void> => {
  await page.getByRole('treeitem', { name: 'Integrations' }).click();
  await expect(page.getByRole('button', { name: '+ Add integration' })).toBeVisible();
};

/**
 * Polls `GET /projects/:id/build/status` (`{ running: boolean }`) until it reports the wanted
 * state — its own short-lived `APIRequestContext` (not the caller's, whose lifetime/dispose order
 * varies per test) that tolerates `ECONNRESET`: the build a "Start" click triggers runs synchronously
 * enough on `backend` (webpack-bundling the workflow, then spawning the runner) to occasionally reset
 * an in-flight keep-alive connection — treated as "not ready yet" rather than a hard failure.
 */
const waitForDevRunnerStatus = async (projectId: string, running: boolean, timeoutMs: number): Promise<void> => {
  const api = await createApiContext();
  try {
    await waitForCondition(async () => {
      const body = await api
        .get(`/projects/${projectId}/build/status`)
        .then((response) => response.json() as Promise<{ running: boolean }>)
        .catch(() => ({ running: !running }));
      if (body.running === running) return true;
    }, timeoutMs);
  } finally {
    await api.dispose();
  }
};

/**
 * Starts the project's dev runner through the toolbar's "Dev" dropdown (Start/Stop/Run function
 * menu items) — replaces the old single "Build dev & Publish" button. The toolbar shows a
 * colored-dot running indicator instead of "Running"/"Not running" text (see
 * `@falang/workflow-client-common`'s `toolbar.tsx`), so readiness is polled via the API instead of
 * read off the DOM.
 */
export const startDevRunnerViaUI = async (page: Page, projectId: string): Promise<void> => {
  await page.getByRole('button', { name: 'Dev' }).click();
  await page.getByRole('menuitem', { name: 'Start' }).click();
  // Generous under a heavily-loaded box (the full suite runs multiple specs' webpack-bundle +
  // runner spawn concurrently against one shared backend container) — seen to occasionally exceed
  // 30-45s there even though a single spec in isolation settles in ~15s.
  await waitForDevRunnerStatus(projectId, true, 60_000);
};

/** Stops the project's dev runner through the toolbar's "Dev" dropdown — see `startDevRunnerViaUI`. */
export const stopDevRunnerViaUI = async (page: Page, projectId: string): Promise<void> => {
  await page.getByRole('button', { name: 'Dev' }).click();
  await page.getByRole('menuitem', { name: 'Stop' }).click();
  await waitForDevRunnerStatus(projectId, false, 20_000);
};

const PLACEHOLDER_BY_KIND = {
  function: 'Function name...',
  'objects-structure': 'Object name...',
  folder: 'Folder name...',
} as const;

/** `ProjectTree`'s single "+ Add" dropdown menu's item labels (`ADD_MENU_ITEMS`) — not the same strings as the placeholders above. */
const MENU_ITEM_LABEL_BY_KIND = {
  function: 'Function',
  'objects-structure': 'Object',
  folder: 'Folder',
} as const;

/**
 * Creates a folder/function/object document at the project root via the tree's single "+ Add"
 * dropdown (`ProjectTree`'s `ADD_MENU_ITEMS`) — picking a menu item reveals an inline name input,
 * not a modal. Returns the created id (folders and documents share the same create response shape:
 * `{ id, ... }`).
 */
export const createTreeItemViaUI = async (
  page: Page,
  kind: keyof typeof PLACEHOLDER_BY_KIND,
  name: string,
): Promise<string> => {
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.getByRole('menuitem', { name: MENU_ITEM_LABEL_BY_KIND[kind] }).click();
  const input = page.getByPlaceholder(PLACEHOLDER_BY_KIND[kind]);
  await input.fill(name);
  const urlFragment = kind === 'folder' ? '/folders' : '/documents';
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes(urlFragment) && res.request().method() === 'POST'),
    input.press('Enter'),
  ]);
  const body = (await response.json()) as { id: string };
  return body.id;
};

/**
 * Creates a `trigger-function` document through the real "New trigger" modal (`NewTriggerModal`) —
 * unlike Function/Folder/Object, its `trigger-function-body` data is fixed at creation (vendor/
 * trigger/credential), so this can't go through the generic "+ Add" flow above. `vendorLabel`/
 * `triggerLabel` are the integration's/trigger's display `label` (e.g. `'Telegram'`/`'On message'`),
 * `credentialName` is the seeded credential instance's `name` — all rendered as antd `Select` option
 * text in the modal.
 */
export const createTriggerFunctionViaUI = async (
  page: Page,
  name: string,
  vendorLabel: string,
  triggerLabel: string,
  credentialName: string,
): Promise<string> => {
  await page.getByRole('button', { name: '+ Add' }).click();
  await page.getByRole('menuitem', { name: 'Trigger' }).click();
  await page.getByPlaceholder('Trigger name...').fill(name);
  // antd renders each required Form.Item's accessible name with a `* ` prefix (e.g. `* Integration`)
  // — `{ name: ... }` here is a substring match, so the plain field label still matches.
  //
  // The dropdown's *visible*, clickable rows (`.ant-select-item-option`, `title="<label>"`) carry no
  // ARIA role at all — `role="option"` only exists on a separate, permanently `0x0`-sized shadow
  // listbox antd renders for screen readers (see rc-select). `getByRole('option', ...)` matches only
  // that invisible mirror and never resolves, so options are targeted by `title` instead — scoped to
  // the currently open dropdown, since the combobox's own already-selected value also carries a
  // matching `title` (for its truncation tooltip), which would otherwise make the plain
  // `page.getByTitle(...)` locator ambiguous once a field already has a value.
  const openDropdownOption = (label: string) =>
    page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByTitle(label, { exact: true });
  await page.getByRole('combobox', { name: 'Integration' }).click();
  await openDropdownOption(vendorLabel).click();
  await page.getByRole('combobox', { name: 'Trigger type' }).click();
  await openDropdownOption(triggerLabel).click();
  await page.getByRole('combobox', { name: 'Credential' }).click();
  await openDropdownOption(credentialName).click();
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/documents') && res.request().method() === 'POST'),
    page.getByRole('dialog').getByRole('button', { name: 'Create' }).click(),
  ]);
  const body = (await response.json()) as { id: string };
  return body.id;
};

export const deleteTreeItemViaUI = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('treeitem', { name }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Delete/ }).click();
};

const CONTEXT_MENU_LABEL_BY_KIND = {
  function: 'New function here',
  'objects-structure': 'New object here',
  folder: 'New subfolder',
} as const;

/** Creates a folder/function/object document nested inside an existing folder via its right-click context menu. */
export const createTreeItemInFolderViaUI = async (
  page: Page,
  folderName: string,
  kind: keyof typeof PLACEHOLDER_BY_KIND,
  name: string,
): Promise<string> => {
  await page.getByRole('treeitem', { name: folderName }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: CONTEXT_MENU_LABEL_BY_KIND[kind] }).click();
  const input = page.getByPlaceholder(PLACEHOLDER_BY_KIND[kind]);
  await input.fill(name);
  const urlFragment = kind === 'folder' ? '/folders' : '/documents';
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes(urlFragment) && res.request().method() === 'POST'),
    input.press('Enter'),
  ]);
  const body = (await response.json()) as { id: string };
  return body.id;
};
