import React from 'react'
import { CELL_HALF } from '../common/constants';
import { Line } from './Line';

interface SkewerBorderLineParams {
    x: number
    y: number
    innerHeight: number
    selected: boolean
}

export const SkewerBorderLine: React.FC<SkewerBorderLineParams> = ({
    x,
    y,
    innerHeight,
    selected,
}) => <g>
    <Line
        x1={x}
        y1={y}
        x2={x}
        y2={y + CELL_HALF}
        selected={selected}
    />
    <Line
        x1={x}
        y1={y + CELL_HALF + innerHeight}
        x2={x}
        y2={y + CELL_HALF * 2 + innerHeight}
        selected={selected}
    />
</g>;
