import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { Line } from '../../cmp/Line';
import { CELL_SIZE } from '../../common/constants';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { CycleIconComponent } from '../cycle/Cycle.icon.cmp';
import { ForEachIconStore } from './ForEach.icon.store';

export const ForeachIconComponent: TIconRenderer<ForEachIconStore> = observer(({ icon }) => {
  return <g id={`ForEach-${icon.id}`}>    
  <BlockContainerComponent
    icon={icon}
  >
    <polyline points={icon.rectPolylinePoints} className='box-body' style={icon.blockBodyStyles} />    
    <polyline points={icon.secondRectPolylinePoints} className='box-body' />
  </BlockContainerComponent>  
  <CycleIconComponent icon={icon} />
  {icon.hasBreak ? <Line
    selected={icon.isInSelected}
    x1={icon.position.x}
    x2={icon.position.x}
    y1={icon.position.y + icon.shape.height}
    y2={icon.position.y + icon.shape.height - CELL_SIZE}
  /> : null}
</g>
});