import { CELL_SIZE } from '../constants.js';
import type { IBlockShapeConfig } from '../types/block-shape.js';

const FOLD = Math.round(CELL_SIZE * 0.75);

const toPoints = (points: readonly (readonly [number, number])[]): string =>
  points.map((point) => point.join(',')).join(' ');

/** A comment: a sheet of paper with its top-right corner folded down. */
export const commentShape: IBlockShapeConfig = {
  view: ({ x, y, width, height, className }) => {
    const fold = Math.min(FOLD, Math.floor(width / 2), Math.floor(height / 2));
    const outline = toPoints([
      [0, 0],
      [width - fold, 0],
      [width, fold],
      [width, height],
      [0, height],
      [0, 0],
    ]);
    const corner = toPoints([
      [width - fold, 0],
      [width - fold, fold],
      [width, fold],
    ]);
    return (
      <svg
        style={{ position: 'absolute', left: x - 1, top: y - 1 }}
        viewBox={`-1 -1 ${width + 2} ${height + 2}`}
        width={width + 2}
        height={height + 2}
        data-comment-shape
      >
        <polyline className={className} points={outline} />
        <polyline className={className} points={corner} />
      </svg>
    );
  },
};
