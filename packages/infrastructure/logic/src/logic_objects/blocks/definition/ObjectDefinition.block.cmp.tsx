import { observer } from "mobx-react";
import React from 'react'
import { CELL_SIZE } from '@falang/editor-scheme';
import { InlineTypeViewComponent } from '../../../logic/cmp/InlineTypeView.cmp';
import { ExpressionComponent } from '../../../logic/expression/Expression.cmp';
import { ObjectDefinitionBlockStore } from './ObjectDefinition.block.store';

const InputsComponent: React.FC<{ block: ObjectDefinitionBlockStore }> = observer(({ block }) => {
  const nameHeight = block.expressionStore.height;
  const vType = block.variableType;
  if (!vType) return null;
  return <>
    <InlineTypeViewComponent
      scheme={block.scheme}
      variableType={block.variableType}
      width={block.width}
      x={block.position.x}
      y={block.position.y + nameHeight}
      projectStore={block.projectStore}
    />
    {vType.type === 'array' ? <InlineTypeViewComponent
      scheme={block.scheme}
      variableType={vType.elementType}
      width={block.width}
      x={block.position.x}
      y={block.position.y + nameHeight + CELL_SIZE}
      projectStore={block.projectStore}
    /> : null}
  </>;
});

export const ObjectDefinitionBlockComponent: React.FC<{ block: ObjectDefinitionBlockStore }> = observer(({ block }) => {
  return <>
    <InputsComponent block={block} />
    <ExpressionComponent store={block.expressionStore} x={block.position.x} y={block.position.y} />
  </>;
});
