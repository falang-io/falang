import { CELL_SIZE, CELL_SIZE_2 } from '../constants.js';
import type { IBlockShapeConfig } from '../types/block-shape.js';

export const rectangleRoundedShape: IBlockShapeConfig = {
  paddings: {
    left: CELL_SIZE,
    right: CELL_SIZE,
  },
  view: ({ x, y, width, height, className }) => (
    <div
      className={className}
      style={{
        left: x - CELL_SIZE - 1,
        top: y - 1,
        width: width + CELL_SIZE_2,
        height,
        borderRadius: CELL_SIZE,
      }}
    />
  ),
};

export const rectangleRoundedFullWidthShape: IBlockShapeConfig = {
  view: ({ x, y, width, height, className }) => (
    <div
      className={className}
      style={{
        left: x,
        top: y,
        width,
        height,
        borderRadius: CELL_SIZE,
      }}
    />
  ),
};
