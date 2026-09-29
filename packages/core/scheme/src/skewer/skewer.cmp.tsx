import React from 'react';
import { Line } from '../cmp/line.js';
import { CELL_HALF, CELL_SIZE } from '../constants.js';
import type { SkewerStore } from './skewer.store.js';
import { observer } from 'mobx-react-lite';
import { useService } from '../hooks/use-service.js';
import { TOKEN_SCHEME, TOKEN_SELECTION } from '../di-tokens.js';
import { VerticalLine } from '../cmp/vertical-line.js';
import { HorisontalLine } from '../cmp/horisontal-line.js';
import { IconView } from '../cmp/icon-view.js';

export const SkewerComponent: React.FC<{ skewer: SkewerStore }> = observer(({ skewer }) => {
  const scheme = useService(TOKEN_SCHEME);
  const selection = useService(TOKEN_SELECTION);
  if (skewer.isCollapsed && !scheme.isEditing) return null;
  const isInSelected = selection.isInSelected(skewer.parent.id);
  return (
    <>
      {skewer.hideEnds ? null : (
        <Line
          x1={skewer.x}
          x2={skewer.x}
          y1={skewer.y + skewer.iconsHeightSum - CELL_SIZE + 1}
          y2={skewer.y + skewer.iconsHeightSum - 1}
          selected={isInSelected}
        />
      )}
      {skewer.verticalLines.map((hw, index) => (
        <VerticalLine key={index} line={hw} isSelected={isInSelected || selection.isHighlighted(hw.targetId)} />
      ))}
      {skewer.horizontalLines.map((hw, index) => (
        <HorisontalLine line={hw} isSelected={isInSelected || selection.isHighlighted(hw.targetId)} key={index} />
      ))}
      {skewer.icons.map((child, index) => (
        <React.Fragment key={child.id}>
          {skewer.hideEnds && index === 0 ? null : (
            <Line x1={skewer.x} x2={skewer.x} y1={child.y - CELL_SIZE + 1} y2={child.y - 1} selected={isInSelected} />
          )}
        </React.Fragment>
      ))}
      {skewer.hasOutError && skewer.out ? (
        <rect
          fill="red"
          x={skewer.out.x - skewer.out.left - CELL_HALF}
          y={skewer.out.y - CELL_HALF}
          width={skewer.out.left + skewer.out.right + CELL_SIZE}
          height={skewer.out.height + CELL_HALF}
        />
      ) : null}
      {skewer.out ? <IconView icon={skewer.out} /> : null}
    </>
  );
});
