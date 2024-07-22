
import React from 'react'
import { CELL_SIZE } from '../common/constants'
import { SchemeStore } from '../store/Scheme.store'
import { Line } from './Line'

export interface IGapControlParams {
  x: number
  y: number
  width: number
  scheme: SchemeStore,
  threadsId: string
  index: number
}

export const GapControlComponent: React.FC<IGapControlParams> = ({
  x,
  y,
  width,
  scheme,
  threadsId,
  index,
}) => <>
    <g
      cursor='col-resize'
      onMouseDown={(e) => {
        e.stopPropagation();
        scheme.gapModify.onMouseDown({
          index,
          threadsId,
          width,
          x,
          y,
        }, e)
      }}
    >
      {width > 0 ? <>
        <Line
          selected={false}
          x1={x + CELL_SIZE / 2}
          x2={x + 4 + width * CELL_SIZE}
          y1={y + CELL_SIZE}
          y2={y + CELL_SIZE}
        />
        <Line
          selected={false}
          x1={x + CELL_SIZE / 2}
          x2={x + CELL_SIZE / 2}
          y1={y}
          y2={y + CELL_SIZE * 2}
        />
      </> : null}
      <rect
        x={x + 4 + width * CELL_SIZE}
        y={y}
        fill="orange"
        stroke="black"
        width={CELL_SIZE - 8}
        height={CELL_SIZE * 2}
        style={{
          opacity: 0.5
        }}
      />
    </g>
  </>;
