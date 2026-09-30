import type { Scheme } from '../scheme/scheme.js';

/** Extent of a laid-out scheme in scheme (unscaled) pixels, relative to the root icon's x/y origin. */
export interface ISchemeBounds {
  /** Distance from the origin (x = 0) to the leftmost drawn point. */
  readonly left: number;
  /** Distance from the origin to the rightmost drawn point. */
  readonly right: number;
  /** `left + right`. */
  readonly width: number;
  /** Distance from the origin (y = 0) to the lowest drawn point. */
  readonly height: number;
}

/**
 * The true drawn extent: the union of the root icon's declared box and, for every icon in the scheme, its own
 * declared box (`x - left` .. `x + right`, `y .. y + height`) and its block box (shape offset, paddings, mods).
 * The root's `left`/`right` alone are not reliable — e.g. a mind-tree thread declares `left = 0` while its skewer
 * (and the child blocks on it) are drawn to the left of the thread's own x.
 *
 * `null` while the scheme has no root icon (empty document). Reads only MobX observables, so it is computed-friendly.
 */
export const getSchemeBounds = (scheme: Scheme): ISchemeBounds | null => {
  const rootIcon = scheme.rootIcon;
  if (!rootIcon) return null;
  let minX = -rootIcon.left;
  let maxX = rootIcon.right;
  let maxY = rootIcon.height;
  for (const icon of scheme.icons.all) {
    const blockLeft = icon.x + icon.blockPosition.x - icon.config.shape.paddings.left;
    const blockRight = icon.x + icon.blockPosition.x + icon.blockWidth + icon.config.shape.paddings.left;
    minX = Math.min(minX, icon.x - icon.left, blockLeft);
    maxX = Math.max(maxX, icon.x + icon.right, blockRight);
    maxY = Math.max(maxY, icon.y + icon.height, icon.y + icon.blockPosition.y + icon.blockFullHeight);
  }
  const left = -minX;
  return { left, right: maxX, width: left + maxX, height: maxY };
};
