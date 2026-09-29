import { observer } from 'mobx-react-lite';
import type { IIconView } from '../../types/icon-config.js';
import type { WhileIconStore } from './while.icon.store.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { VerticalLine } from '../../cmp/vertical-line.js';
import { CELL_SIZE } from '../../constants.js';
import { TrueFalseWords } from '../../cmp/true-false-words.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import { CycleIconComponent } from '../cycle/cycle.icon.cmp.js';

export const WhileIconComponent: IIconView<WhileIconStore> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  return (
    <>
      {icon.hasBreak ? (
        <VerticalLine
          line={{
            x: icon.x,
            y1: icon.y + icon.height - CELL_SIZE,
            y2: icon.y + icon.height,
          }}
          isSelected={isSelected}
        />
      ) : null}
      <TrueFalseWords
        leftX={icon.x}
        leftY={icon.y + icon.blockFullHeight + icon.skewer.height}
        rightX={icon.x - icon.blockFullLeft - 25 - CELL_SIZE}
        rightY={icon.y + Math.round(icon.blockFullHeight / 2) + icon.skewer.height}
        rightOnTop={false}
        trueOnRight={!icon.trueIsMain}
      />
      <BaseIconComponent icon={icon} />
      <CycleIconComponent icon={icon} />
    </>
  );
});
