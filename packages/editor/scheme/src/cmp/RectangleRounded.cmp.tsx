import { observer } from 'mobx-react';
import { BlockStore } from '../common/blocks/store/BlocksStore';
import { CELL_SIZE } from '../common/constants';
import { IconStore } from '../icons/base/Icon.store';

export const RectangleRoundedComponent: React.FC<{ block: BlockStore, fillWidth?: boolean }> = observer(({ block, fillWidth }) => {
  return <rect
    x={block.position.x - (fillWidth ? 0 : CELL_SIZE)}
    y={block.position.y}
    width={block.width + (fillWidth ? 0 : CELL_SIZE * 2)}
    height={block.shape.height}
    rx="16"
  />;
});

