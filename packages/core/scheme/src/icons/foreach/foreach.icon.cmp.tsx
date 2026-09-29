import { observer } from 'mobx-react-lite';
import type { IIconView } from '../../types/icon-config.js';
import type { ForEachIconStore } from './foreach.icon.store.js';
import { BlockShapeContainer, BlockView } from '../../cmp/block-view.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_CSS_CLASSES, TOKEN_SCHEME, TOKEN_SELECTION } from '../../di-tokens.js';
import { cycleFooterShape } from '../../shapes/cycle-footer.js';
import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';
import { CycleIconComponent } from '../cycle/cycle.icon.cmp.js';
import { IconRelativeContainer } from '../../cmp/icon-relative-container.js';
import { VerticalLine } from '../../cmp/vertical-line.js';

export const ForeachIconComponent: IIconView<ForEachIconStore> = observer(({ icon }) => {
  const theme = useService(TOKEN_SCHEME).theme.value;
  const CycleFooter = cycleFooterShape.view;
  const cssClasses = useService(TOKEN_CSS_CLASSES);
  const shapeClassName = cssClasses.getBlockBodyClassName(icon.id);
  const selection = useService(TOKEN_SELECTION);
  const isSelected = selection.isInSelected(icon.id);
  return (
    <>
      <IconRelativeContainer icon={icon}>
        <BlockShapeContainer theme={theme}>
          <CycleFooter
            className={shapeClassName}
            height={CELL_SIZE_2}
            width={CELL_SIZE_2}
            x={0}
            y={icon.blockFullHeight + icon.skewer.height}
          />
        </BlockShapeContainer>
        <BlockView icon={icon} />
      </IconRelativeContainer>
      <CycleIconComponent icon={icon} />
      {icon.hasBreak ? (
        <VerticalLine
          isSelected={isSelected}
          line={{
            x: icon.x,
            y1: icon.y + icon.height,
            y2: icon.y + icon.height - CELL_SIZE,
          }}
        />
      ) : null}
    </>
  );
});
