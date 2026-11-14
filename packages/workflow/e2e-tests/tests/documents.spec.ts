import { test, expect } from './fixtures.js';
import {
  createProjectViaUI,
  createTreeItemInFolderViaUI,
  createTreeItemViaUI,
  deleteTreeItemViaUI,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';

test.describe('documents and folders', () => {
  test('creates function and object documents at the project root', async ({ page }) => {
    await loginAndReachProjectList(page);
    await createProjectViaUI(page, `Documents ${Date.now()}`);

    await createTreeItemViaUI(page, 'function', 'myFunction');
    await createTreeItemViaUI(page, 'objects-structure', 'MyStruct');

    await expect(page.getByRole('treeitem', { name: 'myFunction' })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: 'MyStruct' })).toBeVisible();
    // creating a document also opens it in a tab
    await expect(page.getByRole('tab', { name: 'MyStruct' })).toBeVisible();
  });

  test('a section folder stays expanded and a left click opens its context menu', async ({ page }) => {
    await loginAndReachProjectList(page);
    await createProjectViaUI(page, `Sections ${Date.now()}`);

    await createTreeItemInFolderViaUI(page, 'Functions', 'function', 'insideSection');
    const section = page.getByRole('treeitem', { name: 'Functions' });
    await section.click();
    await expect(page.getByRole('menuitem', { name: 'New function here' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'New subfolder' })).toBeVisible();
    // the click didn't collapse the section
    await expect(page.getByRole('treeitem', { name: 'insideSection' })).toBeVisible();

    await page.getByRole('menuitem', { name: 'New subfolder' }).click();
    await expect(page.getByPlaceholder('Folder name...')).toBeVisible();
  });

  test('creates a folder, nests a document inside it, and reflects the structure after a reload', async ({ page }) => {
    await loginAndReachProjectList(page);
    const projectName = `Folders ${Date.now()}`;
    await createProjectViaUI(page, projectName);

    await createTreeItemInFolderViaUI(page, 'Functions', 'folder', 'Helpers');
    await expect(page.getByRole('treeitem', { name: 'Helpers' })).toBeVisible();

    await createTreeItemInFolderViaUI(page, 'Helpers', 'function', 'nested');
    await expect(page.getByRole('treeitem', { name: 'nested' })).toBeVisible();

    // Reopening the project (no deep-linking — a reload always lands back on the project list,
    // see ADR 0003 (private)) re-fetches the tree from the backend, proving the nesting was
    // actually persisted, not just held in local state.
    await page.reload();
    await openProjectViaUI(page, projectName);
    await expect(page.getByRole('treeitem', { name: 'Helpers' })).toBeVisible();
    await expect(page.getByRole('treeitem', { name: 'nested' })).toBeVisible();
  });

  test('deletes a document, and deleting a folder cascades to the documents inside it', async ({ page }) => {
    await loginAndReachProjectList(page);
    const projectName = `Deletes ${Date.now()}`;
    await createProjectViaUI(page, projectName);

    await createTreeItemViaUI(page, 'function', 'standalone');
    await expect(page.getByRole('treeitem', { name: 'standalone' })).toBeVisible();

    await page.getByRole('treeitem', { name: 'standalone' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('treeitem', { name: 'standalone' })).toBeVisible();

    await deleteTreeItemViaUI(page, 'standalone', true);
    await expect(page.getByRole('treeitem', { name: 'standalone' })).toHaveCount(0);

    await createTreeItemInFolderViaUI(page, 'Functions', 'folder', 'ToDelete');
    await createTreeItemInFolderViaUI(page, 'ToDelete', 'function', 'insideFolder');
    await expect(page.getByRole('treeitem', { name: 'insideFolder' })).toBeVisible();

    await deleteTreeItemViaUI(page, 'ToDelete');
    await expect(page.getByRole('treeitem', { name: 'ToDelete' })).toHaveCount(0);
    await expect(page.getByRole('treeitem', { name: 'insideFolder' })).toHaveCount(0);

    await page.reload();
    await openProjectViaUI(page, projectName);
    await expect(page.getByRole('treeitem', { name: 'ToDelete' })).toHaveCount(0);
    await expect(page.getByRole('treeitem', { name: 'insideFolder' })).toHaveCount(0);
  });
});
