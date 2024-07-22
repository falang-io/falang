import { observer } from 'mobx-react';
import { TBlockComponent } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { CodeComponent } from '@falang/infrastructure-code';
import { ForeachHeaderBlockStore } from './ForeachHeader.block.store';
import { ForeachHeaderLabelsComponent } from './ForeachHeaderLabels.cmp';

export const ForeachHeaderBlockComponent: TBlockComponent<ForeachHeaderBlockStore> = observer(({ block }) => {
  const x = block.position.x;
  const y = block.position.y;
  return <>
    <ForeachHeaderLabelsComponent block={block} />
    <CodeComponent
      alwaysOnLeft
      code={block.arrExpression.code}
      x={x + CELL_SIZE * 4}
      y={y}
    />
    <CodeComponent
      alwaysOnLeft
      code={block.itemExpression.code}
      x={x + CELL_SIZE * 4}
      y={y + block.arrExpression.height}
    />
    {block.hasIndex ? <CodeComponent
      alwaysOnLeft
      code={block.indexExpression.code}
      x={x + CELL_SIZE * 4}
      y={y + block.arrExpression.height + block.itemExpression.height}
    /> : null}
  </>;
});