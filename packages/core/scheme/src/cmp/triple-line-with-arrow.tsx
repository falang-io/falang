import type React from 'react';
import { CELL_SIZE } from '../constants.js';
import { Line } from './line.js';
import { Arrow } from './arrow.js';

interface TripleLineWithArrowProps {
  xStart: number;
  xVerticalLine: number;
  xFinish: number;
  yStart: number;
  yFinish: number;
  selected: boolean;
}

const BACK_ARROW_STEP = 10;
/** How far a line stops short of the arrow tip, so the line doesn't blunt the arrowhead. */
const ARROW_LINE_GAP = 10;

/**
 * Horizontal line from `x1` to `x2` with an arrowhead at `x2`, pointing in the direction of travel.
 */
export const LineWithArrow: React.FC<{ x1: number; x2: number; y: number; selected: boolean }> = ({
  x1,
  x2,
  y,
  selected,
}) => {
  const dir = x2 < x1 ? 'left' : 'right';
  const lineX2 = dir === 'left' ? x2 + ARROW_LINE_GAP : x2 - ARROW_LINE_GAP;
  return (
    <>
      <Line x1={x1} y1={y} x2={lineX2} y2={y} selected={selected} />
      <Arrow x={x2} y={y} dir={dir} selected={selected} />
    </>
  );
};

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
  for (let y = yFinish + step; y < minY; y += step) {
    backArrowsY.push(y);
  }
  const lineXFinish = xFinish < xVerticalLine ? xFinish + ARROW_LINE_GAP : xFinish - ARROW_LINE_GAP;
  return (
    <>
      <Line x1={xStart} y1={yStart} x2={xVerticalLine} y2={yStart} selected={selected} />
      <Line x1={xVerticalLine} y1={yFinish} x2={lineXFinish} y2={yFinish} selected={selected} />
      <Arrow x={xFinish} y={yFinish} dir={xFinish < xVerticalLine ? 'left' : 'right'} selected={selected} />
      <Line x1={xVerticalLine} y1={yStart} x2={xVerticalLine} y2={yFinish} selected={selected} />
    </>
  );
};
