import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { HorisontalLine } from '../../cmp/HorisontalLine';
import { Line } from '../../cmp/Line';
import { VerticalLine } from '../../cmp/VerticalLine';
import { CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { RectangleRoundedComponent } from '../../cmp/RectangleRounded.cmp';
import { MindTreeRootIconStore } from './MindTreeRoot.icon.store';
import { ThreadsComponent } from '../../common/threads/Threads.cmp';
import { IconComponent } from '../base/Icon.cmp';
import { FunctionHeaderComponent } from '../function/cmp/FunctionHeader.cmp';

export const MindTreeRootIconComponent: TIconRenderer<MindTreeRootIconStore> = observer(({ icon }) => {
  const lineY = icon.position.y + icon.header.block.shape.height + CELL_SIZE * 2 + icon.block.shape.height;
  return <g id={`${icon.constructor.name}-${icon.id}`}>
    <Line
      x1={icon.centerX}
      x2={icon.centerX}
      y1={lineY - CELL_SIZE}
      y2={lineY}
      selected={icon.isInSelected}
    />
    <Line
      x1={icon.leftX}
      x2={icon.rightX}
      y1={lineY}
      y2={lineY}
      selected={icon.isInSelected}
    />
    <FunctionHeaderComponent icon={icon.header} />
    <BlockContainerComponent icon={icon}>
      <RectangleRoundedComponent block={icon.block} />
    </BlockContainerComponent>
    <ThreadsComponent icon={icon} />
  </g>;
});
