import { CELL_SIZE, CELL_SIZE_2 } from '../constants.js';
import type { IBlockShapeConfig } from '../types/block-shape.js';

export const cycleFooterShape: IBlockShapeConfig = {
  paddings: {
    left: CELL_SIZE,
    right: CELL_SIZE,
  },
  view: ({ x, y, width, height, className }) => {
    const h = height;
    const halfWidth = Math.round(width / 2);
    const x1 = 0;
    const x2 = x1 + CELL_SIZE;
    const x3 = x + width + CELL_SIZE;
    const x4 = x + width + CELL_SIZE_2;

    const y1 = 0;
    const y2 = CELL_SIZE;
    const y3 = h;

    const points = [
      [x1, y1],
      [x4, y1],
      [x4, y2],
      [x3, y3],
      [x2, y3],
      [x1, y2],
      [x1, y1],
    ]
      .map((p) => p.join(','))
      .join(' ');
    return (
      <svg
        style={{
          position: 'absolute',
          left: x - halfWidth - CELL_SIZE - 1,
          top: y - 1,
        }}
        viewBox={`-1 -1 ${width + CELL_SIZE_2 + 2} ${height + 2}`}
        width={width + CELL_SIZE_2 + 2}
        height={height + 2}
      >
        <polyline className={className} points={points} />
      </svg>
    );
  },
};
