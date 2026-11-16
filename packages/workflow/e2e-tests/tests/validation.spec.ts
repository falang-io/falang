import { test, expect } from './fixtures.js';
import {
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';
import { buildFunctionNode, buildLogNode } from './node-builders.js';
import { buildHttpRequestNode } from './integration-node-builders.js';

/**
 * Browser-tier spec for background node validation (ADR 0068 (private), phases 1-2): the real Monaco type-checks every
 * icon of an opened function document without it being edited — a red block, a hover marker, an error badge on the
 * document tab and an "N errors" pill — and a valid document shows nothing.
 */
test.describe('node validation', () => {
  test('flags an undeclared variable, clears it after an edit, and shows nothing on a valid document', async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await loginAndReachProjectList(page);
    const projectName = `Validation ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const goodId = await createTreeItemViaUI(page, 'function', 'good');
    const badId = await createTreeItemViaUI(page, 'function', 'bad');

    const api = await createApiContext();
    await api.patch(`/projects/${projectId}/documents/${goodId}`, {
      data: {
        root: buildFunctionNode(goodId, [
          {
            id: `${goodId}-var`,
            name: 'create-var',
            data: { name: 'greeting', variableType: { type: 'string' }, value: "'hi'" },
          },
          { id: `${goodId}-set`, name: 'action', data: "greeting = greeting + '!'" },
          buildLogNode(`${goodId}-log`, 'done ${greeting}'),
        ]),
      },
    });
    await api.patch(`/projects/${projectId}/documents/${badId}`, {
      data: {
        root: buildFunctionNode(badId, [
          { id: `${badId}-use`, name: 'action', data: 'missingVariable = 1' },
          buildLogNode(`${badId}-log`, 'ok'),
        ]),
      },
    });
    await page.reload();
    await openProjectViaUI(page, projectName);

    const good = page.locator(`#scheme-${goodId}`);
    const bad = page.locator(`#scheme-${badId}`);
    const tabOf = (name: string) => page.getByRole('tab', { name: new RegExp(name) });

    // The valid document first: nothing is flagged, even after the queue went through it.
    await page.getByRole('treeitem', { name: 'good' }).click();
    await expect(good).toBeVisible();
    await page.waitForTimeout(3000);
    await expect(good.locator('.block-body.has-error')).toHaveCount(0);
    await expect(good.getByTestId('validation-pill')).toHaveCount(0);
    await expect(tabOf('good').getByTestId('document-tab-errors')).toHaveCount(0);

    // The broken one: red block, marker, tab badge, pill.
    await page.getByRole('treeitem', { name: 'bad' }).click();
    await expect(bad).toBeVisible();
    const flagged = bad.locator('.block-body.has-error');
    await expect(flagged).toHaveCount(1, { timeout: 30_000 });
    await expect(bad.locator('.validation-marker.has-error')).toHaveCount(1);
    await expect(tabOf('bad').getByTestId('document-tab-errors')).toHaveText('1');
    const pill = bad.getByTestId('validation-pill');
    await expect(pill).toContainText('1 error');
    await expect(bad.locator('.validation-marker.has-error')).toHaveAttribute('title', /missingVariable/);

    // The pill steps to the (only) problem without breaking anything.
    await pill.click();
    await expect(flagged).toHaveCount(1);

    // Fix the field through the editor; the error disappears once the edit is committed.
    const editedBlock = bad.locator('.block-container', { hasText: 'missingVariable' }).first();
    await editedBlock.dblclick();
    await page.locator('.monaco-editor .view-lines').first().click();
    const inlineError = bad.getByTestId('code-model-error');
    await expect(inlineError).toContainText("Cannot find name 'missingVariable'", {
      timeout: 15_000,
    });
    await expect(inlineError).toHaveCSS('position', 'absolute');
    expect(await inlineError.evaluate((element) => element.parentElement?.classList.contains('block-container'))).toBe(
      true,
    );
    const [blockBounds, errorBounds] = await Promise.all([editedBlock.boundingBox(), inlineError.boundingBox()]);
    if (!blockBounds || !errorBounds) throw new Error('Inline error geometry is not available');
    expect(errorBounds.y).toBeGreaterThanOrEqual(blockBounds.y + blockBounds.height);
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Math.abs(1)');
    await expect(bad.getByTestId('code-model-error')).toHaveCount(0);
    // A click on the empty canvas commits the inline edit.
    await bad.click({ position: { x: 60, y: 300 } });
    await expect(bad.locator('.block-body.has-error')).toHaveCount(0, { timeout: 30_000 });
    await expect(pill).toHaveCount(0);
    await expect(tabOf('bad').getByTestId('document-tab-errors')).toHaveCount(0);

    // The valid document's tab still shows nothing.
    await tabOf('good').click();
    await expect(good.locator('.block-body.has-error')).toHaveCount(0);
    await api.dispose();
  });

  test('shows every Monaco field error in the sidebar form', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAndReachProjectList(page);
    const projectName = `Sidebar validation ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const documentId = await createTreeItemViaUI(page, 'function', 'request');
    const api = await createApiContext();
    await api.patch(`/projects/${projectId}/documents/${documentId}`, {
      data: {
        root: buildFunctionNode(documentId, [
          buildHttpRequestNode(`${documentId}-request`, {
            method: 'GET',
            url: 'https://example.com/${missingUrl}',
            headers: '{ value: missingHeader }',
            resultVariable: '',
          }),
        ]),
      },
    });
    await page.reload();
    await openProjectViaUI(page, projectName);
    await page.getByRole('treeitem', { name: 'request' }).click();

    const scheme = page.locator(`#scheme-${documentId}`);
    await scheme.locator('.block-container', { hasText: 'missingHeader' }).first().dblclick();
    const sidebar = page.locator('.workflow-integration-editor--sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.locator('.ant-form-item-has-error')).toHaveCount(2, { timeout: 15_000 });
    await expect(sidebar.locator('.ant-form-item-explain-error')).toContainText([
      "Cannot find name 'missingUrl'.",
      "Cannot find name 'missingHeader'.",
    ]);
    await api.dispose();
  });
});
