import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { Line } from '../../cmp/Line';
import { CELL_SIZE } from '../../common/constants';
import { ThreadsComponent } from '../../common/threads/Threads.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { SwitchStore } from './Switch.store';

export const SwitchComponent: TIconRenderer<SwitchStore> = observer(({ icon }) => {
  const blockHalfHeight = Math.round(icon.block.shape.height / 2);
  return <g id={`Switch-${icon.id}`}>
    <Line 
      x1={icon.position.x}
      x2={icon.threads.lastIconX}
      y1={icon.position.y + blockHalfHeight}
      y2={icon.position.y + blockHalfHeight}
      selected={icon.isInSelected}
    />
    {icon.threads.icons.map((child) => <Line 
      key={`switch-vline-${icon.id}-${child.id}`}
      x1={child.position.x}
      x2={child.position.x}
      y1={icon.position.y + blockHalfHeight}
      y2={icon.position.y + icon.block.shape.height + CELL_SIZE}
      selected={icon.isInSelected}
    />)}
    <BlockContainerComponent icon={icon}>
      <polyline points={icon.rectPolylinePoints} style={icon.blockBodyStyles} />
    </BlockContainerComponent>
    <ThreadsComponent icon={icon} />
  </g>;
});
