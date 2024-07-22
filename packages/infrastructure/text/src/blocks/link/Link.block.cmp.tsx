import { observer } from 'mobx-react';
import { CELL_HALF, CELL_SIZE } from '@falang/editor-scheme';
import { TextBlockComponent } from '../text/Text.block.cmp';
import { LinkBlockStore } from './LinkBlockStore';
import IconLink from './Link.svg';

export const LinkBlockComponent: React.FC<{ block: LinkBlockStore }> = observer(({ block }) => {
  return <>
    <TextBlockComponent block={block} />
    <circle
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (!block.schemeId) return;
        e.stopPropagation();
        block.scheme.frontRoot.links.linkClicked(block.schemeId);
      }}
      cx={block.position.x + block.shape.width}
      cy={block.position.y}
      r={CELL_HALF}
    />
    <IconLink
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (!block.schemeId) return;
        e.stopPropagation();
        block.scheme.frontRoot.links.linkClicked(block.schemeId);
      }}
      x={block.position.x + block.shape.width - CELL_HALF + 1}
      y={block.position.y - CELL_HALF}
      style={{color: '#666'}}
    />
  </>;
});
