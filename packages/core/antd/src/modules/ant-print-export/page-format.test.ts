import { describe, expect, it } from 'vitest';
import {
  buildPrintPagesCss,
  getContentSizePx,
  mmToPx,
  PAGE_FORMATS,
  selectPageFormat,
  type IPageLayout,
} from './page-format.js';

const CELL = 16;
/** Bounds whose padded size is exactly `w` x `h` px. */
const bounds = (w: number, h: number) => ({
  left: (w - 2 * CELL) / 2,
  right: (w - 2 * CELL) / 2,
  height: h - 2 * CELL,
});

describe('selectPageFormat', () => {
  it('uses A4 portrait for a small tall scheme', () => {
    const layout = selectPageFormat(bounds(200, 300), { cellSize: CELL });
    expect(layout).toMatchObject({ format: 'A4', orientation: 'portrait', widthMm: 210, heightMm: 297, scale: 1 });
  });

  it('fits exactly: content box of A4 portrait is still A4', () => {
    const content = getContentSizePx({ widthMm: 210, heightMm: 297 });
    const layout = selectPageFormat(bounds(content.width, content.height), { cellSize: CELL });
    expect(layout.format).toBe('A4');
    expect(layout.orientation).toBe('portrait');
  });

  it('moves to the next format when one pixel too big', () => {
    const content = getContentSizePx({ widthMm: 210, heightMm: 297 });
    const layout = selectPageFormat(bounds(content.width + 1, content.height), { cellSize: CELL });
    expect(layout.format).toBe('A3');
  });

  it('prefers landscape for a wide scheme and portrait for a tall one', () => {
    expect(selectPageFormat(bounds(700, 300), { cellSize: CELL }).orientation).toBe('landscape');
    expect(selectPageFormat(bounds(300, 700), { cellSize: CELL }).orientation).toBe('portrait');
  });

  it('falls back to the other orientation of the same format before growing', () => {
    // wider than tall (landscape is tried first) but 700 px is taller than A4 landscape's 688 px content height
    const layout = selectPageFormat(bounds(716, 700), { cellSize: CELL });
    expect(layout).toMatchObject({ format: 'A4', orientation: 'portrait', scale: 1 });
  });

  it('scales down on A1 only when the scheme exceeds A1 in both orientations', () => {
    const layout = selectPageFormat(bounds(20_000, 4000), { cellSize: CELL });
    expect(layout.format).toBe('A1');
    expect(layout.orientation).toBe('landscape');
    expect(layout.scale).toBeLessThan(1);
    const content = getContentSizePx(layout);
    expect(20_000 * layout.scale).toBeLessThanOrEqual(content.width + 1e-6);
    expect(4000 * layout.scale).toBeLessThanOrEqual(content.height + 1e-6);
    // the limiting dimension is filled exactly
    expect(Math.max((20_000 * layout.scale) / content.width, (4000 * layout.scale) / content.height)).toBeCloseTo(1);
  });

  it('mmToPx converts at 96 dpi', () => {
    expect(mmToPx(25.4)).toBeCloseTo(96);
    expect(PAGE_FORMATS.A4.widthMm).toBe(210);
  });
});

describe('buildPrintPagesCss', () => {
  const layouts: IPageLayout[] = [
    { format: 'A4', orientation: 'portrait', widthMm: 210, heightMm: 297, scale: 1 },
    { format: 'A3', orientation: 'landscape', widthMm: 420, heightMm: 297, scale: 1 },
    { format: 'A1', orientation: 'landscape', widthMm: 841, heightMm: 594, scale: 0.5 },
  ];

  it('generates one named page rule and one class per page', () => {
    expect(buildPrintPagesCss(layouts)).toMatchInlineSnapshot(`
      "@page falang-print-1 { size: 210mm 297mm; margin: 0 }
      .falang-print-page-1 { page: falang-print-1; width: 210mm; height: 297mm; position: relative; overflow: hidden; box-sizing: border-box; break-after: page }
      @page falang-print-2 { size: 420mm 297mm; margin: 0 }
      .falang-print-page-2 { page: falang-print-2; width: 420mm; height: 297mm; position: relative; overflow: hidden; box-sizing: border-box; break-after: page }
      @page falang-print-3 { size: 841mm 594mm; margin: 0 }
      .falang-print-page-3 { page: falang-print-3; width: 841mm; height: 594mm; position: relative; overflow: hidden; box-sizing: border-box; break-after: page }"
    `);
  });

  it('skips pages that are not measured yet but keeps numbering', () => {
    const css = buildPrintPagesCss([null, layouts[0]]);
    expect(css).not.toContain('falang-print-1');
    expect(css).toContain('@page falang-print-2');
  });
});
