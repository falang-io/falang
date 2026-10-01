import { CELL_SIZE, CELL_SIZE_2 } from '../constants.js';
import type { IBlockShapeConfig } from '../types/block-shape.js';

/**
 * Inverted trapezoid of the DRAKON timer (ADR 0049): the top edge spans the block plus a cell on each
 * side, the bottom edge just the block. With the default 2-cell block that is the old 4-cells-over-2 shape.
 */
export const timerShape: IBlockShapeConfig = {
  paddings: {
    left: CELL_SIZE,
    right: CELL_SIZE,
  },
  view: ({ x, y, width, height, className }) => {
    const top = 0;
    const bottom = y + height;
    const points = [
      [0, top],
      [width + CELL_SIZE_2, top],
      [width + CELL_SIZE, bottom],
      [CELL_SIZE, bottom],
      [0, top],
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
