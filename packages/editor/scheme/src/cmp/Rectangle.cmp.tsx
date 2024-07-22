import { observer } from 'mobx-react';
import { BlockStore } from '../common/blocks/store/BlocksStore';

export const RectangleComponent: React.FC<{ block: BlockStore }> = observer(({ block }) => {
  return <rect
    ry={block.scheme.editing.editingIconId === block.id ? '0px' : '4px'}
    x={block.position.x}
    y={block.position.y}
    width={block.width}
    height={block.shape.height}
  />;
});
