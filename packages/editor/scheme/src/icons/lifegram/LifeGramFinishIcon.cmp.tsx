import { observer } from 'mobx-react';

import React from 'react'
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { Line } from '../../cmp/Line';
import { CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { FunctionFooterComponent } from '../function/cmp/FunctionFooter.cmp';
import { LifeGramFinishIconStore } from './LifeGramFinish.icon.store';

export const LifeGramFinishIconComponent: TIconRenderer<LifeGramFinishIconStore> = observer(({icon}) => {
  //console.log({icon});
  return <>
    <Line
        x1={icon.position.x}
        y1={icon.position.y}
        x2={icon.position.x}
        y2={icon.position.y + CELL_SIZE}
        selected={icon.isInSelected}
    />
    <BlockContainerComponent
      icon={icon}
    >
        <g className='box-body'>
            <polyline
                points={icon.trianglePolylinePoints}
                style={icon.blockBodyStyles}
            />
            <rect
                className='box-body'
                x={icon.position.x - icon.block.shape.leftSize}
                y={icon.position.y + CELL_SIZE}
                width={icon.block.width}
                height={icon.block.shape.height}
                style={icon.blockBodyStyles}
            /> 
        </g>
    </BlockContainerComponent>
    <SkewerComponent skewer={icon.skewer} />    
    <FunctionFooterComponent icon={icon.footer} />
  </>;
});