import type { IBlockShapeConfig } from '../types/block-shape.js';
import { rectangleShape } from './rectangle.js';

/** Draws nothing (pseudo-blocks have their own border); the drag ghost still needs an outline, so it borrows the rectangle. */
export const emptyShape: IBlockShapeConfig = {
  view: () => null,
  ghostView: rectangleShape.view,
};
