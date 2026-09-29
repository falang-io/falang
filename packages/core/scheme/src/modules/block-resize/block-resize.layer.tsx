import { observer } from 'mobx-react-lite';
import { TOKEN_SCHEME } from '../../di-tokens.js';
import { useService } from '../../hooks/use-service.js';
import { CMD_BLOCK_RESIZE_HANDLE_MOUSE_DOWN } from '../../scheme/scheme-commands.js';
import { TOKEN_BLOCK_RESIZE_SERVICE } from './block-resize.service.token.js';
import { RESIZE_HANDLE_SIZE } from './constants.js';

export const BlockResizeLayer: React.FC = observer(() => {
  const scheme = useService(TOKEN_SCHEME);
  const service = useService(TOKEN_BLOCK_RESIZE_SERVICE);
  const icon = service.getHandleIcon(scheme);
  if (!icon) return null;

  const blockPosition = icon.blockPosition;
  const cornerX = icon.x + blockPosition.x + blockPosition.width;
  const cornerY = icon.y + blockPosition.y + icon.config.shape.paddings.top + icon.blockHeight;
  const left = cornerX - RESIZE_HANDLE_SIZE / 2;
  const top = cornerY - RESIZE_HANDLE_SIZE / 2;

  return (
    <div
      className="block-resize-handle"
      style={{ left, top, width: RESIZE_HANDLE_SIZE, height: RESIZE_HANDLE_SIZE }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        scheme.commands.dispatchCommand(CMD_BLOCK_RESIZE_HANDLE_MOUSE_DOWN, { e });
      }}
    >
      <svg width={RESIZE_HANDLE_SIZE} height={RESIZE_HANDLE_SIZE} viewBox="0 0 10 10">
        <path
          d="M1 5 L3 3 M1 5 L3 7 M1 5 H9 M9 5 L7 3 M9 5 L7 7"
          stroke="#fff"
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
});
