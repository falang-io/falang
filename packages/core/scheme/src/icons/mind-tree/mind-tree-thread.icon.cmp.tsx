import { observer } from 'mobx-react-lite';
import type { IIconView } from '../../types/icon-config.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { Line } from '../../cmp/line.js';
import { CELL_SIZE } from '../../constants.js';
import { SkewerComponent } from '../../skewer/skewer.cmp.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import type { MindTreeThreadIconStore } from './mind-tree-thread.icon.store.js';

export const MindTreeThreadIconComponent: IIconView<MindTreeThreadIconStore> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  return (
    <>
      <Line x1={icon.x} x2={icon.x} y1={icon.y} y2={icon.y - CELL_SIZE} selected={isSelected} />
      {icon.skewer.size > 0 ? (
        <Line
          x1={icon.x + CELL_SIZE - icon.blockFullLeft}
          x2={icon.x + CELL_SIZE - icon.blockFullLeft}
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
