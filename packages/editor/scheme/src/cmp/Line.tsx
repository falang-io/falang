import React from 'react'

export interface LineParams {
  x1: number
  y1: number
  x2: number
  y2: number
  selected: boolean
}

export const Line: React.FC<LineParams> = (params) => {
  if (isNaN(params.x1) || isNaN(params.x2) || isNaN(params.y1) || isNaN(params.y2)) return null;
  return <line {...params} className={`connection-line ${params.selected ? ' selected' : ''}`} />;
};
