import { CMD_SCHEME_MOUSE_MOVE, CMD_SCHEME_MOUSE_WHEEL } from '../../scheme/scheme-commands.js';
import type { Scheme } from '../../scheme/scheme.js';

export const registerMouseNavigationHandlers = (baseScheme: Scheme) => {
  baseScheme.commands.registerCommand(CMD_SCHEME_MOUSE_MOVE, (e, scheme) => {
    if (e.buttons !== 1 && e.buttons !== 4) return false;
    scheme.viewPosition.move(e.movementX, e.movementY);
    return true;
  });

  baseScheme.commands.registerCommand(CMD_SCHEME_MOUSE_WHEEL, (e, scheme) => {
    const rect = scheme.getDomRect();
    scheme.viewPosition.zoom({
      x: e.clientX - rect.x,
      y: e.clientY - rect.y,
      wheeldy: e.deltaY,
    });
    return true;
  });
};
