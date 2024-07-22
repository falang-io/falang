import React from 'react'
import { Arrow, TArrowDirection } from './Arrow';
import { Line, LineParams } from './Line';

interface LongLineParams extends LineParams {
  reverseArrow?: boolean
  arrowAtEnd?: boolean
}

export const LongLine: React.FC<LongLineParams> = (params) => {
  const { x1, x2, y1, y2, reverseArrow, selected, arrowAtEnd } = params;
  const noReverse = !reverseArrow;
  const isHorisontal = y1 === y2;
  const dx = isHorisontal ? (x2 > x1 ? 1 : -1) : 0;
  const dy = isHorisontal ? 0 : (y2 > y1 ? 1 : -1);
  const length = Math.abs(isHorisontal ? (x2 - x1) : (y2 - y1));
  let direction: TArrowDirection;
  if (dx > 0) {
    direction = noReverse ? 'right' : 'left';
  } else if (dx < 0) {
    direction = noReverse ? 'left' : 'right';
  } else if (dy > 0) {
    direction = noReverse ? 'bottom' : 'top';
  } else {
    direction = noReverse ? 'top' : 'bottom';
  }

  const arrows: { x: number, y: number }[] = [];
  /*for (let i = step; i < length - CELL_SIZE * 2; i += step) {
    arrows.push({
      x: x1 + dx * i,
      y: y1 + dy * i,
    });
  }*/

  return <>
    <Line {...{ x1, x2, y1, y2, selected }} />
    {arrows.map((arrowPosition, index) => <Arrow key={index} selected={params.selected} {...arrowPosition} dir={direction} />)}
    {arrowAtEnd ? <Arrow selected={params.selected} x={x2} y={y2} dir={direction} /> : null}
  </>;
}
