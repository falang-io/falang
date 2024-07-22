import React from 'react'
import { CELL_SIZE } from '../common/constants';
import { Arrow } from "./Arrow";
import { Line } from "./Line";
import { LongLine } from './LongLine';

interface TripleLineWithArrowProps {
  xStart: number
  xVerticalLine: number
  xFinish: number
  yStart: number
  yFinish: number
  selected: boolean
}

const BACK_ARROW_STEP = 10;

/**
 * Triple line with arrow at the end
 * finish ←─┐
 *          │ vertical line
 * start  ──┘
 */
export const TripleLineWithArrow: React.FC<TripleLineWithArrowProps> = ({
  xStart,
  xVerticalLine,
  xFinish,
  yStart,
  yFinish,
  selected,
}) => {
  const backArrowsY: number[] = [];
  const minY = yStart - CELL_SIZE;
  const step = CELL_SIZE * BACK_ARROW_STEP;
  for(let y = yFinish + step; y < minY; y += step) {
    backArrowsY.push(y);
  }
  return <g>
    <Line x1={xStart} y1={yStart} x2={xVerticalLine} y2={yStart} selected={selected} />
    <Line x1={xVerticalLine} y1={yFinish} x2={xFinish} y2={yFinish} selected={selected} />
    <Arrow x={xFinish} y={yFinish} dir={xFinish < xVerticalLine ? 'left' : 'right'} selected={selected} />
    <LongLine 
      x1={xVerticalLine} y1={yStart} x2={xVerticalLine} y2={yFinish} selected={selected}
    />
  </g>;
}
