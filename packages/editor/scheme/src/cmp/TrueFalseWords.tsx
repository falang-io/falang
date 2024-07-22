import React from 'react'
import { observer } from 'mobx-react'
import { SchemeStore } from '../store/Scheme.store'

interface TrueFalseWordsParams {
    leftX: number
    leftY: number
    rightX: number
    rightY: number
    trueOnRight: boolean
    rightOnTop: boolean
    scheme: SchemeStore
}

export const TrueFalseWords: React.FC<TrueFalseWordsParams> = observer(({
    leftX,
    leftY,
    rightX,
    rightY,
    trueOnRight,
    rightOnTop,
    scheme
}) => {
    const t = scheme.frontRoot.lang.t;
    const lx = leftX - 26;
    const ly = leftY + 10;
    const rx = rightX + 1;
    const ry = rightOnTop ? rightY - 3 : rightY + 10;
    const [trueX, trueY] = trueOnRight ? [rx, ry] : [lx, ly];
    const [falseX, falseY] = trueOnRight ? [lx, ly] : [rx, ry];
    return <>
        <text 
            x={trueX}
            y={trueY}
            fill='green'
            fontSize='10px'>
                {t('base:true')}
        </text>
        <text 
            x={falseX}
            y={falseY}
            fill='#af2e2e'
            fontSize='10px'>
                {t('base:false')}
        </text>    
    </>;
});