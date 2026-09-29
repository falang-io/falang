import { CELL_SIZE } from '../constants.js';
import type { IBlockShapeConfig } from '../types/block-shape.js';
import { rectangleShape } from './rectangle.js';

export const optionShape: IBlockShapeConfig = {
  paddings: {
    bottom: CELL_SIZE,
  },
  view: (props) => {
    const { x, y, width, height, className } = props;
    const points = [
      [width, 0],
      [Math.round(width / 2), CELL_SIZE],
      [0, 0],
    ]
      .map((p) => p.join(','))
      .join(' ');
    const Rectangle = rectangleShape.view;
    return (
      <>
        <svg
          width={width}
          height={CELL_SIZE + 3}
          viewBox={`0 0 ${width} ${CELL_SIZE + 3}`}
          style={{
            position: 'absolute',
            left: x,
            top: y + height,
            width: width,
            height: CELL_SIZE + 3,
            display: 'block',
            overflow: 'visible',
          }}
        >
          <polyline className={className} points={points} />
        </svg>
        <Rectangle {...props} />
      </>
    );
  },
};
