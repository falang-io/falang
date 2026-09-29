import { observer } from 'mobx-react-lite';
import type { IconWithThreadsStore } from '../../threads/icon-with-threads.store.js';
import type { IIconView } from '../../types/icon-config.js';
import { useService } from '../../hooks/use-service.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { IconWithThreadsComponent } from '../../threads/icon-with-threads.cmp.js';
import { HorisontalLine } from '../../cmp/horisontal-line.js';
import { VerticalLine } from '../../cmp/vertical-line.js';
import { CELL_SIZE } from '../../constants.js';

export const ParallelIconComponent: IIconView<IconWithThreadsStore> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const isInSelected = selection.isInSelected(icon.id);
  return (
    <>
      <HorisontalLine
        line={{
          x1: icon.x,
          x2: icon.threads.lastIconX,
          y: icon.y + Math.round(icon.blockFullHeight / 2),
        }}
        isSelected={isInSelected}
      />
      {icon.threads.icons.map((child) => (
        <VerticalLine
          key={`switch-vline-${icon.id}-${child.id}`}
          line={{
            x: child.x,
            y1: icon.y + Math.round(icon.blockFullHeight / 2),
            y2: icon.y + icon.blockFullHeight + CELL_SIZE,
          }}
          isSelected={isInSelected}
        />
      ))}
      <IconWithThreadsComponent icon={icon} />
    </>
  );
});
