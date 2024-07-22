import { observer } from 'mobx-react';
import { BlockStore } from '../store/BlocksStore';
import { InBlockBadgeComponent } from './InBlockBadge.cmp';
import { InBlockLineComponent } from './InBlockLine.cmp';

export const CommonBlockBackgroundComponent: React.FC<{ block: BlockStore }> = observer(({ block }) => {
  const lines = block.getBlockLines();
  const badges = block.getBlockBadges();
  const blocksInBlocks = block.getBlocksInBlock();
  if (!lines?.length && !badges?.length && !blocksInBlocks.length) return null;
  return <>
    <g transform={block.getTranslateValue()}>
      {lines?.map((l, i) => <InBlockLineComponent {...l} key={i} />)}
      {badges?.map((b, i) => <InBlockBadgeComponent {...b} key={i} />)}
    </g>
    {blocksInBlocks.map((b, i) => {
      const Renderer = b.getBackground()
      return <Renderer store={b} key={i} />
    })}
  </>;
});
