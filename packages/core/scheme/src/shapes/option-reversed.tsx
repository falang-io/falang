import { CELL_SIZE } from '../constants.js';
import type { IBlockShapeConfig } from '../types/block-shape.js';
import { rectangleShape } from './rectangle.js';

export const optionRevesedShape: IBlockShapeConfig = {
  paddings: {
    top: CELL_SIZE,
  },
  view: (props) => {
    const { x, y, width, className } = props;
    const points = [
      [width, CELL_SIZE],
      [Math.round(width / 2), 0],
      [0, CELL_SIZE],
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
            top: y,
            width: width,
            height: CELL_SIZE + 3,
            display: 'block',
            overflow: 'visible',
          }}
        >
          <polyline className={className} points={points} />
        </svg>
        <Rectangle {...props} y={y + CELL_SIZE} />
      </>
    );
  },
};
