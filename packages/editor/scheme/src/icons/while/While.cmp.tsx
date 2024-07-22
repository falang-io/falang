import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { Arrow } from '../../cmp/Arrow';
import { Line } from '../../cmp/Line';
import { TrueFalseWords } from '../../cmp/TrueFalseWords';
import { VerticalLine } from '../../cmp/VerticalLine';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { CycleIconComponent } from '../cycle/Cycle.icon.cmp';
import { WhileStore } from './While.store';

export const WhileComponent: TIconRenderer<WhileStore> = observer(({ icon }) => {
  return <g id={`While-${icon.id}`}>
    {/* 
    <Line
      x1={icon.position.x - icon.shape.leftSize}
      x2={icon.position.x}
      y1={icon.position.y + icon.skewer.shape.height + blockHalfHeight}
      y2={icon.position.y + icon.skewer.shape.height + blockHalfHeight}
      selected={icon.isInSelected}
    />
    <Line
      x1={icon.position.x - icon.shape.leftSize}
      x2={icon.position.x - icon.shape.leftSize}
      y1={icon.position.y + icon.skewer.shape.height + blockHalfHeight}
      y2={icon.position.y}
      selected={icon.isInSelected}
    />
    <Line
      x1={icon.position.x - icon.shape.leftSize}
      x2={icon.position.x}
      y1={icon.position.y}
      y2={icon.position.y}
      selected={icon.isInSelected}
    />
    <Arrow
      x={icon.position.x}
      y={icon.position.y}
      dir='right'
      selected={icon.isInSelected}
    />
    */}
    {icon.hasBreak ? <Line 
      x1={icon.position.x}
      x2={icon.position.x}
      y1={icon.position.y + icon.shape.height - CELL_SIZE}
      y2={icon.position.y + icon.shape.height}
      selected={icon.isInSelected}
    /> : null}
    <TrueFalseWords
      leftX={icon.position.x}
      leftY={icon.position.y + icon.block.shape.height + icon.skewer.shape.height}
      rightX={icon.position.x - icon.block.shape.halfWidth - 15 - CELL_SIZE}
      rightY={icon.position.y + icon.block.shape.halfHeight + icon.skewer.shape.height}
      rightOnTop={false}
      trueOnRight={!icon.trueIsMain}
      scheme={icon.scheme}
    />
    <CycleIconComponent icon={icon} />
    <BlockContainerComponent icon={icon}>
      <polyline points={icon.rectPolylinePoints} style={icon.blockBodyStyles} />
    </BlockContainerComponent>
  </g>;
});
