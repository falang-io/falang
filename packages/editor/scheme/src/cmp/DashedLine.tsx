import React from 'react'

export interface DashedLineParams {
    x1: number
    y1: number
    x2: number
    y2: number
    selected: boolean
}

export const DashedLine: React.FC<DashedLineParams> = (params) => {
    return <line strokeDasharray="4" {...params} className={`connection-line ${params.selected ? ' selected' : ''}`} />;
};
