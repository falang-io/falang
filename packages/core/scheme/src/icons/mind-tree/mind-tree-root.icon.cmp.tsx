import { observer } from 'mobx-react-lite';
import type { IIconView } from '../../types/icon-config.js';
import type { MindTreeRootIconStore } from './mind-tree-root.icon.store.js';
import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';
import { Line } from '../../cmp/line.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';

export const MindTreeRootIconComponent: IIconView<MindTreeRootIconStore> = observer(({ icon }) => {
  const lineY = icon.y + icon.header.height + CELL_SIZE_2 + icon.body.blockFullHeight;
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  return (
    <>
      <Line
        x1={icon.body.centerX}
        x2={icon.body.centerX}
        y1={icon.y + icon.header.height}
        y2={icon.y + icon.header.height + CELL_SIZE}
        selected={isSelected}
      />
      <Line x1={icon.body.centerX} x2={icon.body.centerX} y1={lineY - CELL_SIZE} y2={lineY} selected={isSelected} />
      <Line x1={icon.body.leftX} x2={icon.body.rightX} y1={lineY} y2={lineY} selected={isSelected} />
      <BaseIconComponent icon={icon} />
    </>
  );
});
