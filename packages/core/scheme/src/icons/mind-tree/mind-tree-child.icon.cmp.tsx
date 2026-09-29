import { observer } from 'mobx-react-lite';
import type { IIconView } from '../../types/icon-config.js';
import type { MindTreeChildIconStore } from './mind-tree-child.icon.store.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { Line } from '../../cmp/line.js';
import { CELL_SIZE } from '../../constants.js';
import { SkewerComponent } from '../../skewer/skewer.cmp.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';

export const MindTreeChildIconComponent: IIconView<MindTreeChildIconStore> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  const blockHalfHeight = Math.round(icon.blockFullHeight / 2);
  return (
    <>
      <Line
        x1={icon.x}
        x2={icon.x}
        y1={icon.y}
        y2={icon.y + (icon.isLast ? blockHalfHeight : icon.height)}
        selected={isSelected}
      />
      <Line
        x1={icon.x}
        x2={icon.x + CELL_SIZE}
        y1={icon.y + blockHalfHeight}
        y2={icon.y + blockHalfHeight}
        selected={isSelected}
      />
      {icon.skewer.size > 0 ? (
        <Line
          x1={icon.x + CELL_SIZE * 2}
          x2={icon.x + CELL_SIZE * 2}
          y1={icon.y + icon.blockFullHeight}
          y2={icon.y + CELL_SIZE + icon.blockFullHeight}
          selected={isSelected}
        />
      ) : null}
      <BaseIconComponent icon={icon} />
      <SkewerComponent skewer={icon.skewer} />
    </>
  );
});
