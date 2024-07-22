import { observer } from 'mobx-react';
import { TBlockComponent } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { ExpressionEditorComponent } from '../../expression/ExpressionEditor.cmp';
import { ForeachHeaderBlockStore } from './ForeachHeader.block.store';

export const ForeachHeaderBlockEditorComponent: TBlockComponent<ForeachHeaderBlockStore> = observer(({ block }) => {
  const x = block.position.x + CELL_SIZE * 4;
  const y = block.position.y;
  return <>
    <ExpressionEditorComponent blockStore={block} store={block.arrExpression} x={x} y={y} borderBottom />
    <ExpressionEditorComponent blockStore={block} store={block.itemExpression} x={x} y={y + block.arrExpression.height} borderBottom />
    <ExpressionEditorComponent blockStore={block} store={block.indexExpression} x={x} y={y + block.arrExpression.height + block.indexExpression.height} borderBottom />
  </>
});
