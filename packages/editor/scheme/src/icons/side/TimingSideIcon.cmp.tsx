import { observer } from "mobx-react";
import { Line } from "../../cmp/Line";
import React from 'react'
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { TimerSideIconStore } from './TimerSide.icon.store';
import { CELL_SIZE } from '../../common/constants';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
export const TimingSideIconComponent: TIconRenderer<TimerSideIconStore> = observer(({ icon }) => <>
  <Line 
    selected={icon.isInSelected}
    x1={icon.position.x - CELL_SIZE * 2}
    x2={icon.position.x + CELL_SIZE}
    y1={icon.position.y}
    y2={icon.position.y}
  />
  <BlockContainerComponent
    icon={icon}
    hideResize={true}
  >
    <polyline points={icon.rectPolylinePoints} className='box-body' />
  </BlockContainerComponent>
</>);
