import type React from 'react';
import type { IVerticalLine } from '../types/vertical-line.js';

export const VerticalLine: React.FC<{ line: IVerticalLine; isSelected: boolean; dashed?: boolean }> = ({
  line,
  isSelected,
  dashed,
}) => {
  const realY1 = line.shoe ? line.y1 + 8 : line.y1;
  const realY2 = line.nextShoe ? line.y2 - 8 : line.y2;
  const top = Math.min(realY1, realY2) - 1;
  const height = Math.abs(realY1 - realY2) + 2;
  return (
    <div
      className={`vertical-line${isSelected ? ' selected' : ''}${dashed ? ' dashed' : ''}`}
      style={{
        left: line.x - 1,
        top,
        height,
      }}
    />
  );
};
