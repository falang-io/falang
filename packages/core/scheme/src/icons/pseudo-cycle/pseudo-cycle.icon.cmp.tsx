import { observer } from 'mobx-react-lite';
import type { IIconView } from '../../types/icon-config.js';
import type { PseudoCycleIconStore } from './pseudo-cycle.icon.store.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { VerticalLine } from '../../cmp/vertical-line.js';
import { HorisontalLine } from '../../cmp/horisontal-line.js';
import { CELL_HALF, CELL_SIZE } from '../../constants.js';
import { CycleIconComponent } from '../cycle/cycle.icon.cmp.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';

export const PseudoCycleIconComponent: IIconView<PseudoCycleIconStore> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  return (
    <>
      {icon.isEditing ? (
        <>
          <VerticalLine
            line={{
              x: icon.x - icon.left,
              y1: icon.arrowTopY,
              y2: icon.arrowBottomY,
            }}
            isSelected={isSelected}
            dashed
          />
          <HorisontalLine
            line={{
              x1: icon.x - icon.left,
              x2: icon.x,
              y: icon.arrowTopY,
            }}
            isSelected={isSelected}
            dashed
          />
          <HorisontalLine
            line={{
              x1: icon.x - icon.left,
              x2: icon.x,
              y: icon.arrowBottomY,
            }}
            isSelected={isSelected}
            dashed
          />
          <VerticalLine
            line={{
              x: icon.x,
              y1: icon.y + CELL_SIZE + CELL_HALF,
              y2: icon.y + CELL_SIZE * 2 + CELL_HALF,
            }}
            isSelected={isSelected}
          />
        </>
      ) : null}
      <BaseIconComponent icon={icon} />
      <CycleIconComponent icon={icon} />
    </>
  );
});
