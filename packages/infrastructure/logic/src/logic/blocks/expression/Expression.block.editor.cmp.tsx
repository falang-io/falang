import { observer } from "mobx-react";
import { CELL_SIZE } from '@falang/editor-scheme';
import { ConstantOrVariableComponent } from '../../cmp/ConstantOrVariable.cmp';
import { TVariableInfo } from '../../constants';
import { ExpressionEditorComponent } from '../../expression/ExpressionEditor.cmp';
import { ExpressionBlockStore } from './Expression.block.store';
import { TypeEditorComponent } from '../../cmp/TypeEditor.cmp';
import { TBlockComponent } from '@falang/editor-scheme';

const CreateInputsComponent: TBlockComponent<ExpressionBlockStore> = observer(({ block }) => {
  const t = block.scheme.frontRoot.lang.t;
  const vType = block.variableType as TVariableInfo;
  const expressionHeight = block.expressionStore.height;
  if (!vType) return null;
  return <>
    <ConstantOrVariableComponent
      scheme={block.scheme}
      setVariableType={(t) => block.setVariableType(t)}
      variableType={block.variableType}
      x={block.position.x}
      y={block.position.y}
      width={block.shape.halfWidth}
      projectStore={block.projectStore}
    />
    <TypeEditorComponent 
      availableStructures={block.projectStore.availableStructures}
      scheme={block.scheme}
      setVariableType={t => block.setVariableType(t)}
      variableType={vType}
      width={block.width}
      x={block.position.x}
      y={block.position.y + expressionHeight + CELL_SIZE}  
      projectStore={block.projectStore}    
    />
    {/**    <InlineTypeSelectComponent
      scheme={block.scheme}
      setVariableType={t => block.setVariableType(t)}
      variableType={vType}
      width={block.width}
      x={block.position.x}
      y={block.position.y + expressionHeight + CELL_SIZE}
      availableStructures={editor.availableStructures}
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
      y={block.position.y + expressionHeight + CELL_SIZE * 2}
      availableStructures={editor.availableStructures}
    /> : null} */}

  </>;
});

export const ExpressionBlockEditorComponent: TBlockComponent<ExpressionBlockStore> = observer(({ block }) => {
  return <>
    {block.type === 'create' ? <CreateInputsComponent block={block} /> : null}
    <ExpressionEditorComponent blockStore={block} store={block.expressionStore} x={block.position.x} y={block.position.y + (block.type === 'create' ? CELL_SIZE : 0)} />
  </>;
});
