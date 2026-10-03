import { observer } from 'mobx-react-lite';
import { checker } from '../../checker.js';
import { BaseIconComponent } from '../../cmp/base.icon.cmp.js';
import { HorisontalLine } from '../../cmp/horisontal-line.js';
import { VerticalLine } from '../../cmp/vertical-line.js';
import { TOKEN_SELECTION } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import type { IIconView } from '../../types/icon-config.js';
import type { FunctionIconStore } from './function.icon.store.js';

export const FunctionIconComponent: IIconView<FunctionIconStore> = observer(({ icon }) => {
  const selection = useService(TOKEN_SELECTION);
  const body = icon.body;
  const header = icon.header;
  if (!checker.isFunctionBody(body)) return null;
  return (
    <>
      {header ? (
        <VerticalLine
          line={{ x: body.skewer.x, y1: header.y + header.height, y2: body.y }}
          isSelected={selection.isInSelected(icon.id) || selection.isHighlighted(icon.id)}
        />
      ) : null}
      {body.hasReturns ? (
        <HorisontalLine
          isSelected={selection.isInSelected(icon.id) || selection.isHighlighted(icon.id)}
          line={{
            nextShoe: false,
            shoe: false,
            targetId: icon.id,
            x1: body.lastReturnX,
            x2: icon.x + (icon.footer?.right ?? 0),
            y: icon.returnLineBottomY,
          }}
          arrowAtEnd
        />
      ) : null}
      {icon.returnConnectLines.map((hw, index) => (
        <VerticalLine
          key={index}
          line={hw}
          isSelected={selection.isInSelected(icon.id) || selection.isHighlighted(hw.targetId)}
        />
      ))}
      <BaseIconComponent icon={icon} />
    </>
  );
});
