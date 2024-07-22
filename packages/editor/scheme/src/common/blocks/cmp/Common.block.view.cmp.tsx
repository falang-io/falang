import { observer } from 'mobx-react';
import { BlockStore } from '../store/BlocksStore';

export const CommonBlockViewComponent: React.FC<{ block: BlockStore }> = observer(({ block }) => {
  const blocksInBlock = block.getBlocksInBlock();
  if (!blocksInBlock.length) return null;
  return <>{blocksInBlock.map((b, i) => {
    const Renderer = b.getRenderer();
    return <Renderer key={i} store={b} />
  })}</>;
});
