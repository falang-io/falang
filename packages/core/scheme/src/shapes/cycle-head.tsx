import { CELL_SIZE, CELL_SIZE_2 } from '../constants.js';
import type { IBlockShapeConfig } from '../types/block-shape.js';

export const cycleHeaderShape: IBlockShapeConfig = {
  paddings: {
    left: CELL_SIZE,
    right: CELL_SIZE,
  },
  minHeight: CELL_SIZE_2,
  view: ({ x, y, width, height, className }) => {
    const h = height;

    const x1 = 0;
    const x2 = CELL_SIZE;
    const x3 = width + CELL_SIZE;
    const x4 = width + CELL_SIZE_2;

    const y1 = y;
    const y2 = y + CELL_SIZE;
    const y3 = y + h;

    const points = [
      [x1, y2],
      [x2, y1],
      [x3, y1],
      [x4, y2],
      [x4, y3],
      [x1, y3],
      [x1, y2],
    ]
      .map((p) => p.join(','))
      .join(' ');
    return (
      <svg
        style={{
          position: 'absolute',
          left: x - CELL_SIZE - 1,
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
