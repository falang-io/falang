import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { HorisontalLine } from '../../cmp/HorisontalLine';
import { Line } from '../../cmp/Line';
import { VerticalLine } from '../../cmp/VerticalLine';
import { CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { RectangleRoundedComponent } from '../../cmp/RectangleRounded.cmp';
import { MindTreeThreadIconStore } from './MindTreeThread.icon.store';
import { RectangleComponent } from '../../cmp/Rectangle.cmp';

export const MindTreeThreadIconComponent: TIconRenderer<MindTreeThreadIconStore> = observer(({ icon }) => {
  return <g id={`${icon.constructor.name}-${icon.id}`}>
    <Line
      x1={icon.position.x + icon.block.shape.halfWidth}
      x2={icon.position.x + icon.block.shape.halfWidth}
      y1={icon.position.y}
      y2={icon.position.y + CELL_SIZE}
      selected={icon.isInSelected}
    />
    {icon.skewer.size > 0 ? <Line
      x1={icon.position.x + CELL_SIZE}
      x2={icon.position.x + CELL_SIZE}
      y1={icon.position.y + CELL_SIZE + icon.block.shape.height}
      y2={icon.position.y + CELL_SIZE * 2 + icon.block.shape.height}
      selected={icon.isInSelected}
    /> : null}
    <BlockContainerComponent icon={icon}>
      <RectangleComponent block={icon.block} />
    </BlockContainerComponent>
    <SkewerComponent skewer={icon.skewer} />
  </g>;
});
