import { observer } from 'mobx-react';
import { HorisontalLine } from '../../cmp/HorisontalLine';
import { Line } from '../../cmp/Line';
import { VerticalLine } from '../../cmp/VerticalLine';
import { IconComponent } from '../../icons/base/Icon.cmp';
import { OutComponent } from '../outs/Out.cmp';
import { CELL_HALF, CELL_SIZE } from '../constants';
import { IconWithSkewerStore } from './IconWithSkewer.store';
import { SkewerStore } from './Skewer.store';

export const SkewerComponent: React.FC<{ skewer: SkewerStore }> = observer(({ skewer }) => {
  if(skewer.isCollapsed) return null;
  return <g id={`Skewer-${skewer.parentId}`}>
    {skewer.hideEnds ? null : <Line
      x1={skewer.position.x}
      x2={skewer.position.x}
      y1={skewer.position.y + skewer.iconsHeightSum - CELL_SIZE}
      y2={skewer.position.y + skewer.iconsHeightSum}
      selected={skewer.parent.isInSelected}
    />}
    {skewer.verticalLines.map((hw, index) => <VerticalLine
      key={index}
      line={hw}
      isSelected={skewer.parent.isInSelected || skewer.scheme.selection.isHighlighted(hw.type, hw.targetId)}
    />)}
    {/*skewer.highWayHorisontalConnections.map((hw, index) => 
      <HorisontalLine line={hw} isSelected={skewer.parent.isInSelected || skewer.scheme.selection.isHighlighted(hw.type, hw.targetId)} key={index} />
    )*/}
    {skewer.horizontalLines.map((hw, index) => 
      <HorisontalLine line={hw} isSelected={skewer.parent.isInSelected || skewer.scheme.selection.isHighlighted(hw.type, hw.targetId)} key={index} />
    )}
    {skewer.icons.map((child, index) => <g id={`SkewerIcon-${child.id}`} key={child.id}>
      {skewer.hideEnds && index === 0 ? null : <Line
        x1={skewer.position.x}
        x2={skewer.position.x}
        y1={child.position.y - CELL_SIZE}
        y2={child.position.y}
        selected={skewer.parent.isInSelected}
      />}
      <IconComponent icon={child} />
    </g>)}
    <g id={`out-${skewer.parent.id}`}>
      {(skewer.hasOutError && skewer.outStore) ? <rect
        fill='red'
        x={skewer.outStore.position.x - skewer.outStore.shape.leftSize - CELL_HALF }
        y={skewer.outStore.position.y - CELL_HALF }
        width={skewer.outStore.shape.width + CELL_SIZE}
        height={skewer.outStore.shape.height + CELL_HALF}
      /> : null}
    {skewer.outStore ? <OutComponent icon={skewer.outStore} /> : null}
    </g>    
  </g>
});
