import { observer } from "mobx-react";
import React from 'react'
import { CELL_SIZE } from '@falang/editor-scheme';
import { ObjectDefinitionBlockStore } from './ObjectDefinition.block.store';
import { ExpressionEditorComponent } from '../../../logic/expression/ExpressionEditor.cmp';
import { InlineTypeSelectComponent } from '../../../logic/cmp/InlineTypeSelect.cmp';
import { TBlockComponent } from '@falang/editor-scheme';

const InputsComponent: React.FC<{ block: ObjectDefinitionBlockStore }> = observer(({ block }) => {
  const nameHeight = block.expressionStore.height;
  const vType = block.variableType;
  const availableStructures = block.projectStore.availableStructures;
  //console.log('availableStructures', availableStructures);
  if (!vType) return null;
  return <>
    <InlineTypeSelectComponent
      scheme={block.scheme}
      setVariableType={t => block.setVariableType(t)}
      variableType={vType}
      width={block.width}
      x={block.position.x}
      y={block.position.y + nameHeight}
      availableStructures={availableStructures}
      projectStore={block.projectStore}
    />
    {vType.type === 'array' ? <InlineTypeSelectComponent
      scheme={block.scheme}
      setVariableType={t => {
        block.setVariableType({
          ...vType,
          elementType: t,
        })
      }}
      enabledOptionTypes={['boolean', 'decimal', 'float', 'integer', 'string', 'struct']}
      variableType={vType.elementType}
      width={block.width}
      x={block.position.x}
      y={block.position.y + nameHeight + CELL_SIZE}
      availableStructures={availableStructures}
      projectStore={block.projectStore}
    /> : null}
  </>;
});

export const ObjectDefinitionBlockEditorComponent: TBlockComponent<ObjectDefinitionBlockStore> = observer(({ block }) => {
  return <>
    <InputsComponent block={block} />
    <ExpressionEditorComponent store={block.expressionStore} x={block.position.x} y={block.position.y} />
  </>;
});
