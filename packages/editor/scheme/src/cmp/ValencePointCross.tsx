import React from 'react'
import { observer } from "mobx-react";

import { SchemeStore } from '../store/Scheme.store';

interface ValencePointCrossParams {
  scheme: SchemeStore
}

export const ValencePointCross: React.FC<ValencePointCrossParams> = observer(({ scheme }) => {
  const nearestItem = scheme.valencePoints.selectedValencePoint;
  const isBusy = scheme.busy;
  const mode = scheme.mode;
  const valencePointMode = scheme.valencePoints.mode;
  const isInserting = mode === 'edit' && valencePointMode === 'start';
  const className = isInserting ? 'valence-point valence-point-inserting' : 'valence-point';
  if (!nearestItem || isBusy) return null;
  const { x, y } = nearestItem;
  return <g
    onClick={(e) => {
      e.stopPropagation();
      e.preventDefault();
      scheme.valencePoints.onCLick()
    }}
    onContextMenu={(e) => {
      e.stopPropagation();
      e.preventDefault();
      scheme.valencePoints.onContextMenu(e);
    }}
    onMouseDown={(e) => {
      e.preventDefault();
      e.stopPropagation();
    }}
  >
    <circle
      className={className}
      cx={x ?? 0}
      cy={y ?? 0}
      r={10}
      fill={'#666'}
    />
  </g>
});
