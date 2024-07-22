import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { schemeBaseTextStyle } from '@falang/editor-scheme';
import { ForeachHeaderBlockStore } from './ForeachHeader.block.store';

export const ForeachHeaderLabelsComponent: React.FC<{ block: ForeachHeaderBlockStore }> = observer(({ block }) => {
  const t = block.scheme.frontRoot.lang.t;
  const x = block.position.x;
  const y = block.position.y;
  return <>
    <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={x + 4}
      y={y + CELL_SIZE - 4}
    >
      {t('logic:array')}
    </text>
    <line
      className='inblock-line'
      x1={x - CELL_SIZE}
      x2={x + CELL_SIZE + block.shape.width}
      y1={y + CELL_SIZE}
      y2={y + CELL_SIZE}
    />
    <line
      className='inblock-line'
      x1={x + CELL_SIZE * 4}
      x2={x + CELL_SIZE * 4}
      y1={y}
      y2={y + CELL_SIZE * 2 + ((block.hasIndex || block.isMeUnderEdit) ? CELL_SIZE : 0)}
    />
    {block.hasIndex || block.isMeUnderEdit ? <line
      className='inblock-line'
      x1={x - CELL_SIZE}
      x2={x + CELL_SIZE + block.shape.width}
      y1={y + CELL_SIZE * 2}
      y2={y + CELL_SIZE * 2}
    /> : null}
    
    <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={x + 4}
      y={y + block.arrExpression.height + CELL_SIZE - 4}
    >
      {t('logic:item')}
    </text>
    {block.hasIndex || block.isMeUnderEdit ? <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={x + 4}
      y={y + block.arrExpression.height + block.itemExpression.height + CELL_SIZE - 4}
    >
      {t('logic:index')}
    </text> : null}
  </>;
});
