import { observer } from 'mobx-react';
import { TBlockComponent } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IconStore } from '@falang/editor-scheme';
import { TextEditor2Component } from '@falang/infrastructure-text';
import { ExpressionEditor2Component } from '../../expression/ExpressionEditor2.cmp';
import { CallFunctionBlockStore } from './CallFunction.block.store';

export const CallFunctionBlockEditorComponent: TBlockComponent<CallFunctionBlockStore> = observer(({ block }) => {
  let y = block.position.y + CELL_SIZE;
  const maxParameterWidth = block.maxParameterWidth;
  return <>
    {block.parametersExpressions.map((p, index) => {
      const currentY = y;
      y+= p.height;
      return <ExpressionEditor2Component
        key={index}
        store={p}
        x={block.position.x + maxParameterWidth}
        y={currentY}
        blockStore={block}
      />;
    })}
    {block.functionHaveReturn ? <TextEditor2Component
      x={block.position.x + maxParameterWidth}
      y={block.position.y + CELL_SIZE + block.parametersExpressions.length * CELL_SIZE}
      scheme={block.scheme}
      store={block.returnExpression}
    /> : null}
  </>;
});

/**    {block.functionHaveReturn ? <TextComponent
      store={block.returnExpression}
      x={block.position.x + this.maxParameterWidth}
      y={block.position.y + CELL_SIZE + functionData.parameters.length * CELL_SIZE}
    /> : null} */