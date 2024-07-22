import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { HorisontalLine } from '../../cmp/HorisontalLine';
import { Line } from '../../cmp/Line';
import { VerticalLine } from '../../cmp/VerticalLine';
import { CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { RectangleRoundedComponent } from '../../cmp/RectangleRounded.cmp';
import { MindTreeChildIconStore } from './MindTreeChild.icon.store';
import { RectangleComponent } from '../../cmp/Rectangle.cmp';
import { FunctionHeaderComponent } from '../function/cmp/FunctionHeader.cmp';

export const MindTreeChildIconComponent: TIconRenderer<MindTreeChildIconStore> = observer(({ icon }) => {
  return <g id={`${icon.constructor.name}-${icon.id}`}>
    <Line
      x1={icon.position.x}
      x2={icon.position.x}
      y1={icon.position.y}
      y2={icon.position.y + (icon.isLast ? icon.block.shape.halfHeight : icon.shape.height)}
      selected={icon.isInSelected}
    />
    <Line
      x1={icon.position.x}
      x2={icon.position.x + CELL_SIZE}
      y1={icon.position.y + icon.block.shape.halfHeight}
      y2={icon.position.y + icon.block.shape.halfHeight}
      selected={icon.isInSelected}
    />
    {icon.skewer.size > 0 ? <Line
      x1={icon.position.x + CELL_SIZE * 2}
      x2={icon.position.x + CELL_SIZE * 2}
      y1={icon.position.y + icon.block.shape.height}
      y2={icon.position.y + CELL_SIZE + icon.block.shape.height}
      selected={icon.isInSelected}
    /> : null}
    <BlockContainerComponent icon={icon}>
      <RectangleComponent block={icon.block} />
    </BlockContainerComponent>
    {icon.allowChild ? <SkewerComponent skewer={icon.skewer} /> : null}
  </g>;
});
