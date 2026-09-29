import type { IBlockShapeConfig } from '../types/block-shape.js';

export const rectangleShape: IBlockShapeConfig = {
  view: ({ x, y, width, height, className }) => (
    <div
      className={className}
      style={{
        left: x - 1,
        top: y - 1,
        width,
        height,
      }}
    />
  ),
};
