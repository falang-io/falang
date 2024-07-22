import React from 'react'
import { ARROW_LENGTH, ARROW_SIZE } from '../common/constants';

export type TArrowDirection = 'left' | 'right' | 'top' | 'bottom';

interface TArrowParams {
    dir: TArrowDirection
    x: number
    y: number
    selected: boolean
}

export const Arrow: React.FC<TArrowParams> = ({ dir, x, y, selected }) => {
    let x1: number, x2: number, y1: number, y2: number;
    switch(dir) {
        case 'top':
            x1 = x - ARROW_SIZE;
            x2 = x + ARROW_SIZE;
            y1 = y2 = y + ARROW_LENGTH;
            break;
        case 'right':
            x1 = x2 = x - ARROW_LENGTH;
            y1 = y - ARROW_SIZE;
            y2 = y + ARROW_SIZE;
            break;
        case 'bottom':
            x1 = x - ARROW_SIZE;
            x2 = x + ARROW_SIZE;
            y1 = y2 = y - ARROW_LENGTH;
            break;
        case 'left':
            x1 = x2 = x + ARROW_LENGTH;
            y1 = y - ARROW_SIZE;
            y2 = y + ARROW_SIZE;
            break;
        default: 
            throw new Error(`Wrong arrow direction: ${dir}`);                        
    }

    const arrowPointsValue: string = [
        [x2, y2],
        [x, y],
        [x1, y1],
    ].map(item => item.join(',')).join(' ');

    return <polyline
        points={arrowPointsValue}
        className={selected ? 'connection-line selected connection-arrow' : 'connection-line connection-arrow'}
    />
};
