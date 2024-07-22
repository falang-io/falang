import { observer } from "mobx-react";
import React from 'react'
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { Line } from '../../cmp/Line';
import { LongLine } from '../../cmp/LongLine';
import { VerticalLine } from '../../cmp/VerticalLine';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { ThreadsComponent } from '../../common/threads/Threads.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { ParallelIconStore } from './Parallel.icon.store';

export const ParallelIconComponent: TIconRenderer<ParallelIconStore> = observer(({ icon }) => {
  const t = icon.scheme.frontRoot.lang.t;
  return <g>
    {icon.scheme.isEditing ? <BlockContainerComponent
        icon={icon}
    >
        <rect
          x={icon.position.x - 5 * CELL_SIZE}
          y={icon.position.y}
          width={10 * CELL_SIZE}
          height={CELL_SIZE}
          className='box-body box-body-out'
        />
        <text
          x={icon.position.x - 5 * CELL_SIZE + 3}
          y={icon.position.y + CELL_SIZE - 3}
          style={{
            fontSize: '12px',
          }}
        >
          {t('icon:parallel')}
        </text>
    </BlockContainerComponent> : null}
    <LongLine
      x1={icon.position.x }
      y1={icon.position.y + icon.block.shape.height + CELL_HALF - 2}
      x2={icon.threads.lastIconX}
      y2={icon.position.y + icon.block.shape.height + CELL_HALF - 2}
      selected={icon.isInSelected}
    />
    <LongLine
      x1={icon.position.x }
      y1={icon.position.y + icon.block.shape.height + CELL_HALF + 2}
      x2={icon.threads.lastIconX}
      y2={icon.position.y + icon.block.shape.height + CELL_HALF + 2}
      selected={icon.isInSelected}
    />
    {icon.threads.icons.map((child, index) => <Line
      key={`threadsp-${child.id}`}
      selected={icon.isInSelected}
      x1={child.position.x}
      x2={child.position.x}
      y1={icon.position.y + icon.block.shape.height + (index === 0 ? 0 : (CELL_HALF - 2))}
      y2={icon.position.y + icon.block.shape.height + CELL_SIZE}
    />)}
    <LongLine
      x1={icon.position.x }
      y1={icon.position.y + icon.shape.height - 4}
      x2={icon.threads.lastIconX}
      y2={icon.position.y + icon.shape.height - 4}
      selected={icon.isInSelected}
    />
    <ThreadsComponent icon={icon} />
  </g>;
});
