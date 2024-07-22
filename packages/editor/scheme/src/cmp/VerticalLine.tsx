import React from 'react'
import { observer } from "mobx-react";
import { LongLine } from './LongLine';

export interface IVericalLine {
  x: number,
  y1: number,
  y2: number,
  shoe?: boolean,
  nextShoe?: boolean,
  targetId: string,
  type: string,
}

export const VerticalLine: React.FC<{ line: IVericalLine, isSelected: boolean }> = observer(({ line, isSelected }) => {
  const realY1 = line.shoe ? line.y1 + 8 : line.y1;
  const realY2 = line.nextShoe ? line.y2 - 8 : line.y2;
  const d = [
    "M", line.x, line.y1 + 8,
    "A", 8, 8, 0, 1, 0, line.x, line.y1 - 8,
  ].join(" ");
  return <>
    {line.shoe ? <path d={d} fill="none" style={{fill: 'none'}} className={`connection-line ${isSelected ? ' selected' : ''}`}  /> : null}
    <LongLine
      selected={isSelected}
      x1={line.x}
      x2={line.x}
      y1={realY1}
      y2={realY2}
    />
  </>;
});