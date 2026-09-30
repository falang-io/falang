import type { INode } from '@falang/dto';
import { queueOpenAiToolCalls, resetOpenAiMock } from '@falang/workflow-mocks';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
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

const fetchBodyChildren = async (api: APIRequestContext, projectId: string, id: string): Promise<readonly INode[]> => {
  const response = await api.get(`/projects/${projectId}/documents`);
  const docs = (await response.json()) as IDocumentDto[];
  return (
    docs.find((doc) => doc.id === id)?.root?.children?.find((child) => child.name === 'function-body')?.children ?? []
  );
};

/** Polls the saved document until its body satisfies `predicate`; returns the matching body children. */
const waitForBody = (
  api: APIRequestContext,
  projectId: string,
  id: string,
  predicate: (children: readonly INode[]) => boolean,
): Promise<readonly INode[]> =>
  waitForCondition(async () => {
    const children = await fetchBodyChildren(api, projectId, id);
    if (predicate(children)) return children;
  }, 30_000);

/**
 * Left-clicks the (first) valence point of the scheme inside `scope`: hovering a point makes the canvas show
 * its big `.selected-valence-point` target, which is what receives the click.
 */
const clickValencePoint = async (page: Page, scope: Locator): Promise<void> => {
  const point = scope.locator('.valence-point').first();
  await expect(point).toBeAttached();
  const box = await point.boundingBox();
  if (!box) throw new Error('valence point has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const target = scope.locator('.selected-valence-point');
  await expect(target).toBeVisible();
  await target.click();
};

const magicBlocks = (scope: Page | Locator): Locator => scope.locator('.workflow-magic-block');

const queueFill = async (apiKey: string, nodeId: string, messages: readonly string[], note?: string): Promise<void> => {
  await queueOpenAiToolCalls(MOCKS_URL, apiKey, [
    {
      arguments: {
        children: messages.map((message) => ({ data: message, name: 'log' })),
        nodeId,
        ...(note ? { note } : {}),
      },
      name: 'fill_magic_node',
    },
  ]);
  await queueOpenAiToolCalls(MOCKS_URL, apiKey, [{ arguments: { message: 'Done.' }, name: 'finish' }]);
};

/**
 * Browser-tier spec for ADR 0046 (private): the magic node. LLM vendor: the mocks service (scripted
 * `fill_magic_node`/`finish` turns). One project is reused across the ordered steps to keep the runtime down.
 */
test.describe.configure({ mode: 'serial' });

test.describe('magic node', () => {
  const apiKey = `magic-${uniqueSuffix()}`;
  const holder: { api: APIRequestContext | null } = { api: null };
  const getApi = (): APIRequestContext => {
    if (!holder.api) throw new Error('api context not initialised');
    return holder.api;
  };

  test.beforeAll(async () => {
    const api = await createApiContext();
    holder.api = api;
    await resetOpenAiMock(MOCKS_URL, apiKey);
    const settings = await api.put('/admin/settings/agent', {
      data: { apiKey, baseUrl: `${MOCKS_URL}/openai`, model: 'mock-model' },
    });
    expect(settings.ok()).toBeTruthy();
  });

  test.afterAll(async () => {
    const api = getApi();
    await api.delete('/admin/settings/agent').catch(() => {
      // best-effort cleanup
    });
    await resetOpenAiMock(MOCKS_URL, apiKey).catch(() => {
      // best-effort cleanup
    });
    await api.dispose();
  });

  test('insert, generate, popup, hand edit, update with AI, unwrap, persistence', async ({ page }) => {
    test.setTimeout(240_000);
    const api = getApi();
    await loginAndReachProjectList(page);
    const projectName = `Magic ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const mainId = await createTreeItemViaUI(page, 'function', 'main');
    await api.patch(`/projects/${projectId}/documents/${mainId}`, { data: { root: buildFunctionNode(mainId) } });
    await page.reload();
    await openProjectViaUI(page, projectName);
    await page.getByRole('treeitem', { name: 'main' }).click();

    const main = page.locator('body');

    // (a) Left click on the valence point inserts a magic node that opens for typing.
    await expect(page.getByTestId('toolbar-magic-insert')).toBeEnabled();
    await clickValencePoint(page, main);
    const input = page.locator('textarea.editable-content');
    await expect(input).toBeVisible();
    const saved = await waitForBody(api, projectId, mainId, (children) =>
      children.some((child) => child.name === 'magic'),
    );
    const magicId = saved.find((child) => child.name === 'magic')?.id;
    if (!magicId) throw new Error('magic node not saved');

    await queueFill(apiKey, magicId, ['hello-magic']);
    await input.fill('say greeting');
    await input.press('Enter');

    await expect(magicBlocks(page)).toHaveCount(1);
    await expect(magicBlocks(page).first()).toContainText('say greeting');
    await waitForBody(api, projectId, mainId, (children) => {
      const magic = children.find((child) => child.name === 'magic');
      return magic?.children?.some((child) => child.name === 'log') === true;
    });
    // The main scheme shows only the magic block, not the generated log.
    await expect(page.locator('.block-container').filter({ hasText: 'hello-magic' })).toHaveCount(0);

    // Double-click opens the popup: the log step between Start and End; Cancel closes it.
    await magicBlocks(page).first().dblclick();
    const modal = page.getByTestId('magic-editor-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Start', { exact: true })).toBeVisible();
    await expect(modal.getByText('End', { exact: true })).toBeVisible();
    await expect(modal.locator('.block-container').filter({ hasText: 'hello-magic' })).toBeVisible();
    await expect(page.getByTestId('magic-editor-status')).toHaveAttribute('data-status', 'idle');
    await page.getByTestId('magic-editor-cancel').click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.workflow-magic-block__status--handEdited')).toHaveCount(0);

    // (f) The document was saved: a reload keeps the magic block and its text.
    await page.reload();
    await openProjectViaUI(page, projectName);
    await page.getByRole('treeitem', { name: 'main' }).click();
    await expect(magicBlocks(page).first()).toContainText('say greeting');

    // (b) A hand edit inside the popup (add an action) + OK marks the block "modified by hand".
    await magicBlocks(page).first().dblclick();
    await expect(modal).toBeVisible();
    await expect(modal.locator('.block-container').filter({ hasText: 'hello-magic' })).toBeVisible();
    await clickValencePoint(page, modal);
    // A fresh action opens for inline editing; leave it empty.
    await page.keyboard.press('Escape');
    await page.getByTestId('magic-editor-ok').click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('.workflow-magic-block__status--handEdited')).toHaveCount(1);
    await waitForBody(api, projectId, mainId, (children) => {
      const magic = children.find((child) => child.name === 'magic');
      return magic?.meta?.handEdited === true;
    });

    // (c) Change the spell inline -> confirm -> "Update with AI" -> new steps, hand-edited mark gone.
    await queueFill(apiKey, magicId, ['first-step', 'second-step']);
    await magicBlocks(page).first().click();
    const editor = page.locator('textarea.editable-content');
    await expect(editor).toBeVisible();
    await editor.fill('say two things');
    await editor.press('Enter');
    await page.getByTestId('magic-confirm-ok').click();
    await waitForBody(api, projectId, mainId, (children) => {
      const magic = children.find((child) => child.name === 'magic');
      const messages = new Set(
        (magic?.children ?? []).filter((child) => child.name === 'log').map((child) => child.data),
      );
      return messages.has('first-step') && messages.has('second-step') && magic?.meta?.handEdited !== true;
    });
    await expect(magicBlocks(page).first()).toContainText('say two things');
    await expect(page.locator('.workflow-magic-block__status--handEdited')).toHaveCount(0);
    await magicBlocks(page).first().dblclick();
    await expect(modal).toBeVisible();
    await expect(modal.locator('.block-container').filter({ hasText: 'first-step' })).toBeVisible();
    await expect(modal.locator('.block-container').filter({ hasText: 'second-step' })).toBeVisible();
    await page.getByTestId('magic-editor-cancel').click();
    await expect(modal).toHaveCount(0);

    // (e) Unwrap through the context menu: the steps are drawn in the main scheme, no magic block left.
    await magicBlocks(page).first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Unwrap' }).click();
    await expect(magicBlocks(page)).toHaveCount(0);
    await expect(page.locator('.block-container').filter({ hasText: 'first-step' })).toBeVisible();
    await expect(page.locator('.block-container').filter({ hasText: 'second-step' })).toBeVisible();
    const unwrapped = await waitForBody(
      api,
      projectId,
      mainId,
      (children) => !children.some((c) => c.name === 'magic'),
    );
    expect(unwrapped.filter((child) => child.name === 'log')).toHaveLength(2);
  });

  test('Escape on a fresh magic node makes an action; the toggle off inserts an action directly', async ({ page }) => {
    test.setTimeout(120_000);
    const api = getApi();
    await loginAndReachProjectList(page);
    const projectName = `Magic toggle ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const mainId = await createTreeItemViaUI(page, 'function', 'main');
    await api.patch(`/projects/${projectId}/documents/${mainId}`, { data: { root: buildFunctionNode(mainId) } });
    await page.reload();
    await openProjectViaUI(page, projectName);
    await page.getByRole('treeitem', { name: 'main' }).click();
    const main = page.locator('body');

    // (d) Escape on the fresh node -> a plain action.
    await clickValencePoint(page, main);
    const input = page.locator('textarea.editable-content');
    await expect(input).toBeVisible();
    await input.press('Escape');
    await expect(magicBlocks(page)).toHaveCount(0);
    await waitForBody(api, projectId, mainId, (children) => children.length === 1 && children[0].name === 'action');

    // (g) Toggle off -> a left click inserts an action straight away.
    await page.getByTestId('toolbar-magic-insert').click();
    await clickValencePoint(page, main);
    await page.keyboard.press('Escape');
    await expect(magicBlocks(page)).toHaveCount(0);
    await waitForBody(
      api,
      projectId,
      mainId,
      (children) => children.length === 2 && children.every((c) => c.name === 'action'),
    );
  });
});
