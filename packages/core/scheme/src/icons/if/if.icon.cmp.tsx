import { observer } from 'mobx-react-lite';
import type { IIconView } from '../../types/icon-config.js';
import type { IfIconStore } from './if.icon.store.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import { ThreadsComponent } from '../../threads/threads.cmp.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import { HorisontalLine } from '../../cmp/horisontal-line.js';
import { VerticalLine } from '../../cmp/vertical-line.js';
import { TrueFalseWords } from '../../cmp/true-false-words.js';
import { CELL_SIZE } from '../../constants.js';

export const IfIconComponent: IIconView<IfIconStore> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isInSelected = selection.isInSelected(icon.id);
  return (
    <>
      <HorisontalLine
        line={{
          x1: icon.x,
          x2: icon.rightBranchX,
          y: icon.y + Math.round(icon.blockHeight / 2),
        }}
        isSelected={isInSelected}
      />
      {icon.isShortRightBranch ? null : (
        <VerticalLine
          line={{
            x: icon.rightBranchX,
            y1: icon.y + Math.round(icon.blockHeight / 2),
            y2: icon.y + icon.blockHeight,
          }}
          isSelected={isInSelected}
        />
      )}
      <TrueFalseWords
        leftX={icon.x}
        leftY={icon.y + icon.blockHeight}
        rightX={icon.x + Math.round(icon.blockWidth / 2) + CELL_SIZE}
        rightY={icon.y + Math.round(icon.blockHeight / 2)}
        rightOnTop
        trueOnRight={icon.trueOnRight}
      />
      <BaseIconComponent icon={icon} />
      <ThreadsComponent threads={icon.threads} />
    </>
  );
});
