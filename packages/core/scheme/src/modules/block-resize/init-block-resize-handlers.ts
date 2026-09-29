import { resolveService } from '@falang/di';
import {
  CMD_BLOCK_RESIZE_HANDLE_MOUSE_DOWN,
  CMD_ICON_MOUSE_OVER,
  CMD_SCHEME_MOUSE_MOVE,
  CMD_SCHEME_MOUSE_UP,
} from '../../scheme/scheme-commands.js';
import type { Scheme } from '../../scheme/scheme.js';
import { TOKEN_BLOCK_RESIZE_SERVICE } from './block-resize.service.token.js';

export const initBlockResizeHandlers = (baseScheme: Scheme) => {
  baseScheme.commands.registerCommand(CMD_ICON_MOUSE_OVER, ({ icon }, scheme) => {
    const service = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, scheme.container);
    return service.setHoveredIcon(icon, scheme);
  });

  baseScheme.commands.registerCommand(CMD_BLOCK_RESIZE_HANDLE_MOUSE_DOWN, ({ e }, scheme) => {
    const service = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, scheme.container);
    const icon = service.getHandleIcon(scheme);
    if (!icon) return false;
    e.preventDefault();
    e.stopPropagation();
    return service.startResize(icon, scheme);
  });

  // Higher priority than mouse-navigation's panning handler so an active resize
  // consumes the drag instead of also panning the canvas.
  baseScheme.commands.registerCommand(
    CMD_SCHEME_MOUSE_MOVE,
    (_, scheme) => {
      const service = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, scheme.container);
      return service.updateResize(scheme);
    },
    1,
  );

  baseScheme.commands.registerCommand(CMD_SCHEME_MOUSE_UP, (_, scheme) => {
    const service = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, scheme.container);
    return service.finishResize(scheme);
  });
};
