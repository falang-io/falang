import { observer } from "mobx-react";
import React from 'react'
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { CELL_SIZE } from '../../common/constants';
import { SkewerComponent } from '../../common/skewer/Skewer.cmp';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { ParallelThreadIconStore } from './ParallelThread.icon.store';

export const ParallelThreadIconComponent: TIconRenderer<ParallelThreadIconStore> = observer(({ icon }) => <g>
  
    {icon.scheme.isEditing ? <BlockContainerComponent
        icon={icon}
    >
        <rect
          x={icon.position.x - 2 * CELL_SIZE}
          y={icon.position.y}
          width={4 * CELL_SIZE}
          height={CELL_SIZE}
          className='box-body box-body-out'
        />
        <text
          x={icon.position.x - 2 * CELL_SIZE + 3}
          y={icon.position.y + CELL_SIZE - 3}
          style={{
            fontSize: '12px',
          }}
        >
          {icon.scheme.frontRoot.lang.t('icon:parallel_thread')}
        </text>
    </BlockContainerComponent> : null}

    <SkewerComponent skewer={icon.skewer} />
</g>);
