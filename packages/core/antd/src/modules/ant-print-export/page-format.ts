/** Pure page-format maths for the print export (ADR 0048 (private), section 3) — no DOM. */

export type TPageFormat = 'A4' | 'A3' | 'A2' | 'A1';
export type TPageOrientation = 'portrait' | 'landscape';

/** ISO 216 portrait sizes in mm, smallest first (the search order). */
export const PAGE_FORMATS: Record<TPageFormat, { readonly widthMm: number; readonly heightMm: number }> = {
  A4: { widthMm: 210, heightMm: 297 },
  A3: { widthMm: 297, heightMm: 420 },
  A2: { widthMm: 420, heightMm: 594 },
  A1: { widthMm: 594, heightMm: 841 },
};

/** Absorbs floating-point noise so an exactly-fitting scheme does not jump to the next format. */
const EPSILON = 1e-6;

const FORMAT_ORDER: readonly TPageFormat[] = ['A4', 'A3', 'A2', 'A1'];

export const PRINT_MARGIN_MM = 10;
export const PRINT_HEADER_MM = 8;

const MM_PER_INCH = 25.4;
const CSS_PX_PER_INCH = 96;

export const mmToPx = (mm: number): number => (mm * CSS_PX_PER_INCH) / MM_PER_INCH;

export interface IPageLayout {
  readonly format: TPageFormat;
  readonly orientation: TPageOrientation;
  /** Full sheet size, already oriented. */
  readonly widthMm: number;
  readonly heightMm: number;
  /** `1` unless the scheme is larger than an A1 content box. */
  readonly scale: number;
}

export interface ISelectPageFormatBounds {
  readonly left: number;
  readonly right: number;
  readonly height: number;
}

const orient = (format: TPageFormat, orientation: TPageOrientation): { widthMm: number; heightMm: number } => {
  const { widthMm, heightMm } = PAGE_FORMATS[format];
  return orientation === 'portrait' ? { widthMm, heightMm } : { widthMm: heightMm, heightMm: widthMm };
};

/** Content box (inside margins and the header line) of an oriented sheet, in CSS px. */
export const getContentSizePx = (
  layout: Pick<IPageLayout, 'widthMm' | 'heightMm'>,
): { width: number; height: number } => ({
  width: mmToPx(layout.widthMm - 2 * PRINT_MARGIN_MM),
  height: mmToPx(layout.heightMm - 2 * PRINT_MARGIN_MM - PRINT_HEADER_MM),
});

/**
 * The smallest of A4..A1 whose content box holds the scheme (plus `cellSize` padding on every side) at
 * scale 1; between the two orientations of that format the one matching the scheme's own aspect is tried first.
 * Larger than A1: A1 in the preferred orientation, scaled down uniformly to fit both dimensions.
 */
export const selectPageFormat = (bounds: ISelectPageFormatBounds, options: { cellSize: number }): IPageLayout => {
  const schemeW = bounds.left + bounds.right + 2 * options.cellSize;
  const schemeH = bounds.height + 2 * options.cellSize;
  const orientations: readonly TPageOrientation[] =
    schemeW > schemeH ? ['landscape', 'portrait'] : ['portrait', 'landscape'];

  for (const format of FORMAT_ORDER) {
    for (const orientation of orientations) {
      const size = orient(format, orientation);
      const content = getContentSizePx(size);
      if (schemeW <= content.width + EPSILON && schemeH <= content.height + EPSILON) {
        return { format, orientation, ...size, scale: 1 };
      }
    }
  }
  const orientation = orientations[0];
  const size = orient('A1', orientation);
  const content = getContentSizePx(size);
  return {
    format: 'A1',
    orientation,
    ...size,
    scale: Math.min(content.width / schemeW, content.height / schemeH),
  };
};

/** Provisional layout used while a page is still being measured. */
export const PROVISIONAL_LAYOUT: IPageLayout = { format: 'A4', orientation: 'portrait', ...PAGE_FORMATS.A4, scale: 1 };

/** Both names are generated here only — a typo'd/missing named page silently prints as Letter. */
export const printPageName = (index: number): string => `falang-print-${index + 1}`;
export const printPageClassName = (index: number): string => `falang-print-page-${index + 1}`;

const formatMm = (value: number): string => `${Math.round(value * 1000) / 1000}mm`;

/** The `@page` rule plus the class that binds one sheet to it, for every already-measured page (`null` = skipped). */
export const buildPrintPagesCss = (layouts: readonly (IPageLayout | null)[]): string =>
  layouts
    .map((layout, index) => {
      if (!layout) return '';
      const name = printPageName(index);
      const width = formatMm(layout.widthMm);
      const height = formatMm(layout.heightMm);
      return [
        `@page ${name} { size: ${width} ${height}; margin: 0 }`,
        `.${printPageClassName(index)} { page: ${name}; width: ${width}; height: ${height}; position: relative; overflow: hidden; box-sizing: border-box; break-after: page }`,
      ].join('\n');
    })
    .filter((rule) => rule !== '')
    .join('\n');

/** Screen-only sizing of the preview sheets: each is scaled down by `--falang-print-k` with its layout footprint shrunk to match. */
export const buildPrintPreviewCss = (layouts: readonly (IPageLayout | null)[]): string =>
  [
    '@media screen {',
    ...layouts.map((layout, index) => {
      const { widthMm, heightMm } = layout ?? PROVISIONAL_LAYOUT;
      return `.${printPageClassName(index)} { margin: 0 calc(${formatMm(widthMm)} * (var(--falang-print-k, 1) - 1)) calc(${formatMm(heightMm)} * (var(--falang-print-k, 1) - 1)) 0 }`;
    }),
    '}',
  ].join('\n');
