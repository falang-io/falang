import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { Line } from '../../cmp/Line';
import { TrueFalseWords } from '../../cmp/TrueFalseWords';
import { VerticalLine } from '../../cmp/VerticalLine';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { ThreadsComponent } from '../../common/threads/Threads.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IfIconStore } from './If.icon.store';

export const IfIconComponent: TIconRenderer<IfIconStore> = observer(({ icon }) => {
  const blockHalfHeight = Math.round(icon.block.shape.height / 2);
  return <g id={`If-${icon.id}`}>
    <Line 
      x1={icon.position.x}
      x2={icon.rightBranchX}
      y1={icon.position.y + blockHalfHeight}
      y2={icon.position.y + blockHalfHeight}
      selected={icon.isInSelected}
    />
    {icon.isShortRightBranch ? null : <Line 
      x1={icon.rightBranchX}
      x2={icon.rightBranchX}
      y1={icon.position.y + blockHalfHeight}
      y2={icon.position.y + icon.block.shape.height}
      selected={icon.isInSelected}
    />}
    <TrueFalseWords 
        leftX={icon.position.x}
        leftY={icon.position.y + icon.block.shape.height}
        rightX={icon.position.x + icon.block.shape.halfWidth + CELL_SIZE}
        rightY={icon.position.y + icon.block.shape.halfHeight}
        rightOnTop={true}
        trueOnRight={icon.trueOnRight}
        scheme={icon.scheme}
    />
    <BlockContainerComponent icon={icon}>
      <polyline points={icon.rectPolylinePoints} style={icon.blockBodyStyles} />
    </BlockContainerComponent>
    <ThreadsComponent icon={icon} />
  </g>;
});
