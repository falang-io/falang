import { observer } from 'mobx-react';
import { checker } from '../../..';
import { BlockStore } from '../store/BlocksStore';

export const CommonBlockEditorComponent: React.FC<{ block: BlockStore }> = observer(({ block }) => {
  const blocksInBlock = block.getBlocksInBlock();
  if (!blocksInBlock.length) return null;
  return <>{blocksInBlock.map((b, i) => {
    const Editor = b.getEditor();
    return <Editor key={i} store={b} blockStore={block} />
  })}</>;
});
