import React from 'react'
import { observer } from "mobx-react";
import { LongLine } from './LongLine';

export interface IHorisontalLine {
  x1: number,
  x2: number,
  y: number,
  shoe: boolean,
  nextShoe: boolean,
  reverseArrow?: boolean,
  targetId: string,
  type: string,
}

export const HorisontalLine: React.FC<{ line: IHorisontalLine, isSelected: boolean, arrowAtEnd?: boolean }> = ({ line, isSelected, arrowAtEnd }) => {
  const realX1 = line.shoe ? line.x1 + 8 : line.x1;
  const realX2 = line.nextShoe ? line.x2 - 8 : line.x2;
  const d = [
    "M", line.x1 + 8, line.y,
    "A", 8, 8, 0, 1, 0, line.x1 - 8, line.y
  ].join(" ");
  return <>
    {line.shoe ? <path d={d} fill="none" style={{fill: 'none'}} className={`connection-line ${isSelected ? ' selected' : ''}`} /> : null}
    {line.x1 !== line.x2 ? <LongLine
      selected={isSelected}
      x1={realX1}
      x2={realX2}
      y1={line.y}
      y2={line.y}
      reverseArrow={line.reverseArrow}
      arrowAtEnd={arrowAtEnd}
    /> : null }
  </>;
};