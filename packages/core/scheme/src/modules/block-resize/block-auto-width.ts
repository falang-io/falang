import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';

/** The widest a block is ever grown to by itself: wider content keeps overflowing (the user may still resize it). */
export const AUTO_WIDTH_MAX = CELL_SIZE * 40;

/**
 * The width a block of `currentWidth` should grow to so that content `contentWidth` wide fits — a multiple of
 * `CELL_SIZE_2` (the block is centred on the skewer, so both edges stay on the grid, like a manual resize), at most
 * `max` — or `null` when it already fits or can't grow. Never shrinks.
 */
export const computeAutoBlockWidth = (
  currentWidth: number,
  contentWidth: number,
  max: number = AUTO_WIDTH_MAX,
): number | null => {
  // A sub-pixel difference (scrollWidth rounding) is not an overflow.
  if (contentWidth <= currentWidth + 1) return null;
  const width = Math.min(max, Math.ceil(contentWidth / CELL_SIZE_2) * CELL_SIZE_2);
  return width > currentWidth ? width : null;
};
