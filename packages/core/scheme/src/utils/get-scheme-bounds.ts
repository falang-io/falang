import type { Scheme } from '../scheme/scheme.js';

/** Extent of a laid-out scheme in scheme (unscaled) pixels, relative to the root icon's x/y origin. */
export interface ISchemeBounds {
  /** Distance from the origin to the left edge of the root icon's bounding box. */
  readonly left: number;
  /** Distance from the origin to the right edge. */
  readonly right: number;
  /** `left + right`. */
  readonly width: number;
  readonly height: number;
}

/** `null` while the scheme has no root icon (empty document). */
export const getSchemeBounds = (scheme: Scheme): ISchemeBounds | null => {
  const rootIcon = scheme.rootIcon;
  if (!rootIcon) return null;
  const left = rootIcon.left;
  const right = rootIcon.right;
  return { left, right, width: left + right, height: rootIcon.height };
};
