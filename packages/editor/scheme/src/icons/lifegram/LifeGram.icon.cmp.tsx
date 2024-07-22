import { observer } from 'mobx-react';
import { LifeGramFinishIconComponent } from './LifeGramFinishIcon.cmp';
import React from 'react'
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { LifeGramIconStore } from './LifeGram.icon.store';
import { LongLine } from '../../cmp/LongLine';
import { TripleLineWithArrow } from '../../cmp/TripleLineWithArrow';
import { FunctionHeaderComponent } from '../function/cmp/FunctionHeader.cmp';
import { ThreadsComponent } from '../../common/threads/Threads.cmp';
import { CELL_SIZE } from '../../common/constants';
import { BlockContainerComponent } from '../../common/blocks/cmp/BlockContainer.cmp';
import { RectangleRoundedComponent } from '../../cmp/RectangleRounded.cmp';
import { Line } from '../../cmp/Line';

export const LifeGramIconRootComponent: TIconRenderer<LifeGramIconStore> = observer(({icon}) => {
  return <>
    <LongLine
      x1={icon.position.x}
      x2={icon.finish.position.x}
      y1={icon.position.y + icon.header.shape.height + icon.block.shape.height + CELL_SIZE}
      y2={icon.position.y + icon.header.shape.height + icon.block.shape.height + CELL_SIZE}
      selected={icon.isInSelected}
    />
    <LongLine
      x1={icon.bottomLastX}
      x2={icon.position.x}
      y1={icon.position.y + icon.header.shape.height + icon.block.shape.height + CELL_SIZE + icon.threads.shape.height}
      y2={icon.position.y + icon.header.shape.height + icon.block.shape.height + CELL_SIZE + icon.threads.shape.height}
      selected={icon.isInSelected}
    />
    <TripleLineWithArrow
      xStart={icon.position.x}
      xVerticalLine={icon.position.x - icon.threads.shape.leftSize - CELL_SIZE}
      xFinish={icon.position.x}
      yStart={icon.position.y + icon.header.shape.height + icon.block.shape.height + CELL_SIZE + icon.threads.shape.height}
      selected={icon.isInSelected}
      yFinish={icon.position.y + icon.header.shape.height + icon.block.shape.height + CELL_SIZE}
    />
    <Line 
      x1={icon.position.x}
      x2={icon.position.x}
      y1={icon.position.y + icon.header.shape.height + icon.block.shape.height}
      y2={icon.position.y + icon.header.shape.height + icon.block.shape.height + CELL_SIZE}
      selected={icon.isInSelected}
    />
    <FunctionHeaderComponent icon={icon.header} />
    <BlockContainerComponent icon={icon}>
      <RectangleRoundedComponent block={icon.block} />
    </BlockContainerComponent>
    <ThreadsComponent icon={icon} />
    <LifeGramFinishIconComponent icon={icon.finish} />
  </>;
});
