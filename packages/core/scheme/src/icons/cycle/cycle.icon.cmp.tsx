import { observer } from 'mobx-react-lite';
import type { CycleIconStore } from './cycle.icon.store.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { LineWithArrow, TripleLineWithArrow } from '../../cmp/triple-line-with-arrow.js';
import { Line } from '../../cmp/line.js';
import { VerticalLine } from '../../cmp/vertical-line.js';
import { SkewerComponent } from '../../skewer/skewer.cmp.js';

export const CycleIconComponent: React.FC<{ icon: CycleIconStore }> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isInSelected = selection.isInSelected(icon.id);
  return (
    <>
      {icon.hideBackArrow ? null : (
        <TripleLineWithArrow
          xStart={icon.arrowBottomX}
          xVerticalLine={icon.x - icon.left}
          xFinish={icon.arrowTopX}
          yStart={icon.arrowBottomY}
          selected={isInSelected}
          yFinish={icon.arrowTopY}
        />
      )}
      {icon.hasBreak ? (
        <Line
          x1={icon.vericalBrakeLineX}
          y1={icon.verticalBrakeLineY}
          x2={icon.vericalBrakeLineX}
          y2={icon.breakArrowY}
          selected={isInSelected || selection.isHighlighted(icon.id)}
        />
      ) : null}
      {icon.hasBreak ? (
        <LineWithArrow
          x1={icon.vericalBrakeLineX}
          x2={icon.breakArrowX}
          y={icon.breakArrowY}
          selected={isInSelected || selection.isHighlighted(icon.id)}
        />
      ) : null}
      {icon.verticalContinueLineX && icon.myContinueOutline ? (
        <VerticalLine
          isSelected={isInSelected || selection.isHighlighted(icon.id)}
          line={{
            x: icon.verticalContinueLineX,
            y1: icon.myContinueOutline.y,
            y2: icon.continueLineLastY,
            targetId: icon.id,
            type: 'continue',
          }}
        />
      ) : null}
      {icon.verticalContinueLineX ? (
        <LineWithArrow
          selected={isInSelected || selection.isHighlighted(icon.id)}
          x1={icon.verticalContinueLineX}
          x2={icon.continueLineLastX}
          y={icon.continueLineLastY}
        />
      ) : null}
      <SkewerComponent skewer={icon.skewer} />
    </>
  );
});
