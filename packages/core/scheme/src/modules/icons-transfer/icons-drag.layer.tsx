import { observer } from 'mobx-react-lite';
import { TOKEN_SCHEME } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import { BlockShapeContainer } from '../../cmp/block-view.js';
import { TOKEN_ICONS_TRANSFER_SERVICE } from './icons-transfer.service.token.js';
import type { IGhostShape } from './icons-transfer.types.js';

const GhostShape: React.FC<{ shape: IGhostShape }> = observer(({ shape }) => {
  const scheme = useService(TOKEN_SCHEME);
  const { icon, x, y } = shape;
  const blockPosition = icon.blockPosition;
  if (blockPosition.width === 0) return null;
  const ShapeView = icon.config.shape.view;
  return (
    <div style={{ position: 'absolute', left: x, top: y }}>
      <BlockShapeContainer theme={scheme.theme.value}>
        <ShapeView {...blockPosition} height={icon.blockHeight} className="block-body drag-ghost" icon={icon} />
      </BlockShapeContainer>
    </div>
  );
});

/**
 * The ghost contour of the icons being dragged (selection + every descendant's shape, lines/arrows skipped),
 * following the cursor. `pointer-events: none` so it never intercepts the mouse-up or the hover that picks the
 * drop-target valence point.
 */
export const IconsDragLayer: React.FC = observer(() => {
  const service = useService(TOKEN_ICONS_TRANSFER_SERVICE);
  const shapes = service.ghostShapes;
  if (shapes.length === 0) return null;
  return (
    <div className="icons-drag-layer">
      {shapes.map((shape) => (
        <GhostShape key={shape.icon.id} shape={shape} />
      ))}
    </div>
  );
});
