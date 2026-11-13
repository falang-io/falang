// oxlint-disable no-await-in-loop -- the Fields dialog rows are added one after another.
import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.js';
import { createProjectViaUI, loginAndReachProjectList } from './fixtures.js';
import type { Page } from '@playwright/test';

/** ADR 0075 (private): creating a table from the tree, its fields dialog, the records grid, the dev/prod switch and CSV. */

const createTableViaUI = async (page: Page, name: string): Promise<string> => {
  await page.getByRole('button', { name: '+ Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Table', exact: true }).click();
  const input = page.getByPlaceholder('Table name...');
  await input.fill(name);
  const [response] = await Promise.all([
    page.waitForResponse((res) => res.url().includes('/documents') && res.request().method() === 'POST'),
    input.press('Enter'),
  ]);
  return ((await response.json()) as { id: string }).id;
};

/** Adds one text field per name in the Fields dialog (each "Add field" appends a new `fieldN` row) and saves. */
const addTextFieldsViaUI = async (page: Page, names: readonly string[]): Promise<void> => {
  await page.getByTestId('table-fields-button').click();
  const dialog = page.getByTestId('table-fields-dialog');
  for (const [index, name] of names.entries()) {
    await dialog.getByTestId('table-add-field').click();
    await dialog.getByTestId('table-field-name').nth(index).fill(name);
  }
  await page.getByTestId('table-fields-save').click();
  await expect(page.getByTestId('table-fields-dialog')).toHaveCount(0);
};

test.describe('project tables', () => {
  test('creates a table, adds fields and a row, edits a cell, keeps dev and prod apart, CSV export and import', async ({
    page,
  }) => {
    await loginAndReachProjectList(page);
    await createProjectViaUI(page, `Tables ${Date.now()}`);

    await createTableViaUI(page, 'Clients');
    await expect(page.getByRole('treeitem', { name: 'Clients' })).toBeVisible();
    await expect(page.getByTestId('table-editor')).toBeVisible();
    // The grid opens on production records; the rest of the test starts in dev.
    await expect(page.getByTestId('table-env').locator('.ant-segmented-item-selected')).toHaveText('Prod');
    await page.getByTestId('table-env').getByText('Dev', { exact: true }).click();

    await addTextFieldsViaUI(page, ['Name', 'City']);
    await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'City *' })).toHaveCount(0);

    // A required field with a default is optional in the new-row form.
    await page.getByTestId('table-fields-button').click();
    const fieldsDialog = page.getByTestId('table-fields-dialog');
    const cityField = fieldsDialog.getByTestId('table-field-row').nth(1);
    await expect(cityField).toHaveCSS('border-top-width', '1px');
    await expect(cityField.getByTestId('table-field-default')).toHaveCount(0);
    await cityField.getByRole('checkbox').check();
    const defaultInput = cityField.getByTestId('table-field-default');
    await expect(defaultInput).toBeVisible();
    const checkboxBox = await cityField.getByRole('checkbox').boundingBox();
    const defaultBox = await defaultInput.boundingBox();
    expect(defaultBox?.y ?? 0).toBeGreaterThan(checkboxBox?.y ?? 0);
    await defaultInput.locator('textarea').fill('Paris');
    await page.getByTestId('table-fields-save').click();
    await expect(page.getByTestId('table-fields-dialog')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'City *' })).toBeVisible();

    // Add a row through the "Add row" form, leaving the defaulted required field untouched.
    await page.getByTestId('table-add-row').click();
    const modal = page.getByRole('dialog');
    const nameInput = modal.locator('[data-testid="table-new-cell"][data-field-name="Name"] textarea');
    const nameInputHeight = await nameInput.evaluate((element) => element.getBoundingClientRect().height);
    await nameInput.fill('Ann\nSmith');
    await expect
      .poll(() => nameInput.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(nameInputHeight);
    await expect(modal.locator('[data-testid="table-new-cell"][data-field-name="City"] textarea')).toHaveValue('Paris');
    await modal.getByRole('button', { name: 'Add row' }).click();
    await expect(page.getByRole('cell', { name: 'Ann Smith' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Paris' })).toBeVisible();

    // Edit a cell inline: Enter adds a line, blur saves.
    await page.getByRole('cell', { name: 'Paris' }).getByTestId('table-cell').click();
    const editor = page.getByTestId('table-cell-editor').locator('textarea');
    await editor.fill('Rome');
    const editorHeight = await editor.evaluate((element) => element.getBoundingClientRect().height);
    await editor.press('Enter');
    await editor.pressSequentially('Italy');
    await expect(editor).toHaveValue('Rome\nItaly');
    await expect
      .poll(() => editor.evaluate((element) => element.getBoundingClientRect().height))
      .toBeGreaterThan(editorHeight);
    await editor.press('Tab');
    await expect(page.getByRole('cell', { name: 'Rome Italy' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Paris' })).toHaveCount(0);

    // Prod is a separate, empty set of records.
    await page.getByTestId('table-env').getByText('Prod', { exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Ann Smith' })).toHaveCount(0);

    // Export dev's CSV, then import it into prod.
    await page.getByTestId('table-env').getByText('Dev', { exact: true }).click();
    await expect(page.getByRole('cell', { name: 'Ann Smith' })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('table-export-button').click(),
    ]);
    const csvPath = await download.path();
    const csv = await readFile(csvPath, 'utf8');
    expect(csv).toContain('Name');
    expect(csv).toContain('Ann');
    expect(csv).toContain('Smith');
    expect(csv).toContain('Rome');

    await page.getByTestId('table-env').getByText('Prod', { exact: true }).click();
    await page.getByTestId('table-import-button').click();
    await page.getByTestId('table-csv-file').setInputFiles(csvPath);
    await page.getByTestId('table-csv-run').click();
    await expect(page.getByTestId('table-csv-result')).toContainText('Inserted 1');
    await page.getByRole('button', { name: 'Close' }).first().click();
    await expect(page.getByRole('cell', { name: 'Ann Smith' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Rome Italy' })).toBeVisible();

    // Reload: the table, its fields and both environments' records persisted.
    await page.reload();
    await page.getByRole('treeitem', { name: 'Clients' }).click();
    await expect(page.getByTestId('table-editor')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'City' })).toBeVisible();
  });
});
