import type { INode } from '@falang/dto';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';
import { createApiContext, createProjectViaUI, createTreeItemViaUI, loginAndReachProjectList } from './fixtures.js';
import { waitForCondition } from './integration-test-helpers.js';

const clickValencePoint = async (page: Page, scope: Locator): Promise<void> => {
  const point = scope.locator('.valence-point').first();
  const target = scope.locator('.selected-valence-point');
  await expect(async () => {
    const box = await point.boundingBox();
    if (!box) throw new Error('valence point has no box');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(target).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await target.click();
};

const fetchBodyChildren = async (api: APIRequestContext, projectId: string, documentId: string) => {
  const response = await api.get(`/projects/${projectId}/documents`);
  const documents = (await response.json()) as { id: string; root?: INode }[];
  return (
    documents
      .find((document) => document.id === documentId)
      ?.root?.children?.find((child) => child.name === 'function-body')?.children ?? []
  );
};

const readSchemeScale = (page: Page): Promise<string> =>
  page
    .locator('.valence-points-layer')
    .first()
    .evaluate((layer) => {
      let element = layer.parentElement;
      while (element) {
        const scale = element.style.transform.match(/^scale\((.+)\)$/)?.[1];
        if (scale) return scale;
        element = element.parentElement;
      }
      throw new Error('scheme scale element not found');
    });

test('valence-point click opens a filtered insertion picker without zooming the scheme on wheel', async ({ page }) => {
  const api = await createApiContext();
  try {
    await loginAndReachProjectList(page);
    const projectId = await createProjectViaUI(page, `Insert picker ${Date.now()}`);
    const documentId = await createTreeItemViaUI(page, 'function', 'main');
    await page.getByRole('treeitem', { name: 'main' }).click();

    await clickValencePoint(page, page.locator('body'));
    const search = page.getByTestId('item-picker-search');
    await expect(search).toBeVisible();
    const initialChildren = await fetchBodyChildren(api, projectId, documentId);
    expect(initialChildren).toHaveLength(0);

    const options = page.getByTestId('item-picker-option');
    const scaleBeforeWheel = await readSchemeScale(page);
    await options.first().hover();
    await page.mouse.wheel(0, 500);
    const list = page.locator('.ant-modal .ant-list');
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await readSchemeScale(page)).toBe(scaleBeforeWheel);

    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await search.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await search.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await search.fill('Log');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText('Log');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await search.press('Enter');
    await expect(search).not.toBeVisible();

    await waitForCondition(async () => {
      const children = await fetchBodyChildren(api, projectId, documentId);
      if (children.length === 1 && children[0].name === 'log') return children;
    }, 30_000);
  } finally {
    await api.dispose();
  }
});
