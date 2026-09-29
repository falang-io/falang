import type React from 'react';
import { VerticalLine } from './vertical-line.js';
import { HorisontalLine } from './horisontal-line.js';

export interface ILineParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  selected?: boolean;
}

/**
 * @param params
 * @returns
 */
export const Line: React.FC<ILineParams> = (params) => {
  if (params.x1 === params.x2) {
    return (
      <VerticalLine
        line={{
          x: params.x1,
          y1: params.y1,
          y2: params.y2,
        }}
        isSelected={Boolean(params.selected)}
      />
    );
  }
  if (params.y1 === params.y2) {
    return (
      <HorisontalLine
        line={{
          y: params.y1,
          x1: params.x1,
          x2: params.x2,
        }}
        isSelected={Boolean(params.selected)}
      />
    );
  }
  return null;
  /*if (Number.isNaN(params.x1) || Number.isNaN(params.x2) || Number.isNaN(params.y1) || Number.isNaN(params.y2)) return null;
  re+turn <line {...params} className={`connection-line ${params.selected ? ' selected' : ''}`} />;*/
};
