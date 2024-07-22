import { observer } from 'mobx-react';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { DashedLine } from '../../cmp/DashedLine';
import { Line } from '../../cmp/Line';
import { LongLine } from '../../cmp/LongLine';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { CycleIconComponent } from '../cycle/Cycle.icon.cmp';
import { PseudoCycleIconStore } from './PseudoCycle.icon.store';

export const PseudoCycleIconComponent: TIconRenderer<PseudoCycleIconStore> = observer(({ icon }) => {
  return <g id={`pseudocycle-${icon.id}`}>
  {icon.scheme.isEditing ? <>
    <DashedLine
      x1={icon.position.x - icon.shape.leftSize}
      x2={icon.position.x - icon.shape.leftSize}
      y1={icon.arrowTopY}
      y2={icon.arrowBottomY}
      selected={icon.isInSelected}
    />
    <DashedLine
      x1={icon.position.x - icon.shape.leftSize}
      x2={icon.position.x}
      y1={icon.arrowTopY}
      y2={icon.arrowTopY}
      selected={icon.isInSelected}
    />
    <DashedLine
      x1={icon.position.x - icon.shape.leftSize}
      x2={icon.position.x}
      y1={icon.arrowBottomY}
      y2={icon.arrowBottomY}
      selected={icon.isInSelected}
    />
    <Line
      x1={icon.position.x}
      y1={icon.position.y + CELL_SIZE + CELL_HALF}
      x2={icon.position.x}
      y2={icon.position.y + CELL_SIZE * 2 + CELL_HALF}
      selected={icon.isInSelected}
    />
    <BlockContainerComponent
      icon={icon}
    >
      <rect
        x={icon.position.x - 3 * CELL_SIZE}
        y={icon.position.y}
        width={6 * CELL_SIZE}
        height={CELL_SIZE}
        className='box-body box-body-out'
      />
      <text
        x={icon.position.x - 3 * CELL_SIZE + 3}
        y={icon.position.y + CELL_SIZE - 3}
        style={{
          fontSize: '12px',
        }}
      >
        {icon.scheme.frontRoot.lang.t('icon:pseudo_cycle')}
      </text>
    </BlockContainerComponent>
  </> : null}
  {icon.hasBreak ? <LongLine
    x1={icon.position.x}
    y1={icon.position.y + icon.shape.height - CELL_SIZE - CELL_HALF}
    x2={icon.position.x}
    y2={icon.position.y + icon.shape.height - CELL_HALF}
    selected={icon.isInSelected}
  /> : null}
  <CycleIconComponent icon={icon} />
</g>;
});