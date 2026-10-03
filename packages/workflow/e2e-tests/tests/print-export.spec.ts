import { mkdirSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { test, expect } from './fixtures.js';
import {
  clickProjectMenuItem,
  createApiContext,
  createProjectViaUI,
  createTreeItemViaUI,
  loginAndReachProjectList,
  openProjectViaUI,
} from './fixtures.js';
import { buildFunctionNode, buildLogNode } from './node-builders.js';

/** ISO sizes in pt (portrait) — ADR 0048 (private). */
const FORMAT_PT: Record<string, readonly [number, number]> = {
  A4: [595.28, 841.89],
  A3: [841.89, 1190.55],
  A2: [1190.55, 1683.78],
  A1: [1683.78, 2383.94],
};
const TOLERANCE_PT = 2;

/**
 * Browser-tier spec for the PDF print export (ADR 0048 (private), phase 2): three documents of very
 * different sizes -> toolbar "PDF" -> "Print" -> the preview layer lays out one sheet per document ->
 * Chromium's `page.pdf({ preferCSSPageSize: true })` (what `window.print()` -> "Save as PDF" produces)
 * must give exactly one page per sheet, each with the sheet's own format and orientation.
 */
test.describe('print export to PDF', () => {
  test('one PDF page per sheet, each in the format its scheme needs', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await loginAndReachProjectList(page);
    const projectName = `Print export ${Date.now()}`;
    const projectId = await createProjectViaUI(page, projectName);
    const smallId = await createTreeItemViaUI(page, 'function', 'small');
    const tallId = await createTreeItemViaUI(page, 'function', 'tall');
    await createTreeItemViaUI(page, 'objects-structure', 'Shape');

    const api = await createApiContext();
    await api.patch(`/projects/${projectId}/documents/${smallId}`, {
      data: { root: buildFunctionNode(smallId, [buildLogNode(`${smallId}-log`, 'hi')]) },
    });
    const manyLogs = Array.from({ length: 60 }, (_, i) => buildLogNode(`${tallId}-log-${i}`, `line ${i}`));
    await api.patch(`/projects/${projectId}/documents/${tallId}`, {
      data: { root: buildFunctionNode(tallId, manyLogs) },
    });
    await page.reload();
    await openProjectViaUI(page, projectName);
    await page.getByRole('treeitem', { name: 'small' }).waitFor();

    await clickProjectMenuItem(page, 'Download PDF');
    await expect(page.getByTestId('print-export-modal')).toBeVisible();
    await page.getByTestId('print-export-ok').click();

    const sheets = page.getByTestId('print-sheet');
    await expect(sheets).toHaveCount(3);
    await expect(page.locator('[data-testid="print-sheet"][data-status="measuring"]')).toHaveCount(0, {
      timeout: 30_000,
    });
    // Let the layout settle after the last sheet's final `setPosition`/`setScale`.
    await page.waitForTimeout(500);

    const scratch = process.env.PRINT_EXPORT_OUT_DIR;
    if (scratch) {
      mkdirSync(scratch, { recursive: true });
      await page.screenshot({ path: `${scratch}/print-layer.png` });
    }

    const descriptors = await sheets.evaluateAll((elements) =>
      elements.map((el) => ({
        format: (el as HTMLElement).dataset.format ?? '',
        orientation: (el as HTMLElement).dataset.orientation ?? '',
        status: (el as HTMLElement).dataset.status ?? '',
      })),
    );
    for (const d of descriptors) {
      expect(d.status).toBe('ready');
      expect(Object.keys(FORMAT_PT)).toContain(d.format);
    }
    expect(new Set(descriptors.map((d) => `${d.format}/${d.orientation}`)).size).toBeGreaterThanOrEqual(2);

    const pdfBytes = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    if (scratch) writeFileSync(`${scratch}/print-export.pdf`, pdfBytes);
    await testInfo.attach('print-export.pdf', { body: pdfBytes, contentType: 'application/pdf' });

    const pdf = await PDFDocument.load(pdfBytes);
    const pages = pdf.getPages();
    // One page per sheet also proves the editor chrome (toolbar, tree, sidebar) is not printed.
    expect(pages).toHaveLength(descriptors.length);
    pages.forEach((pdfPage, i) => {
      const { format, orientation } = descriptors[i];
      const [short, long] = FORMAT_PT[format];
      const [expectedWidth, expectedHeight] = orientation === 'landscape' ? [long, short] : [short, long];
      const { width, height } = pdfPage.getSize();
      expect(Math.abs(width - expectedWidth), `page ${i + 1} width (${format} ${orientation})`).toBeLessThan(
        TOLERANCE_PT,
      );
      expect(Math.abs(height - expectedHeight), `page ${i + 1} height (${format} ${orientation})`).toBeLessThan(
        TOLERANCE_PT,
      );
    });

    // Closing the layer returns to the editor.
    await page.getByTestId('print-close').click();
    await expect(page.getByTestId('print-layer')).toHaveCount(0);
  });
});
