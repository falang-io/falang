import { observer } from 'mobx-react';
import { BlockStore } from '../common/blocks/store/BlocksStore';
import { CELL_HALF, CELL_SIZE } from '../common/constants';
import { getInEditorBlockStyle } from '../common/text/getInEditorBlockStyle';

export const BlockErrorsComponent: React.FC<{ block: BlockStore }> = observer(({ block }) => {
  if(!block.hasError) return null;
  const errors = block.getErrorsTexts();
  return <div
    style={{
      ...getInEditorBlockStyle(block.scheme, block.position.x + CELL_HALF, block.position.y + block.shape.height + CELL_HALF, block.shape.width + CELL_SIZE),
      background: '#fff0f0',
      color: '#ff4817',
      border: '1px solid red',
      padding: '5px',
      zIndex: 990,
    }}
  >
    {errors.map((err, index) => <div key={index}>{err}</div>)}
  </div>
});