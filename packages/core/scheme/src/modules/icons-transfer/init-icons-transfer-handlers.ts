import { resolveService } from '@falang/di';
import {
  CMD_ICON_CONTEXT_MENU,
  CMD_ICON_MOUSE_CLICK,
  CMD_ICON_MOUSE_DOUBLE_CLICK,
  CMD_ICON_MOUSE_DOWN,
  CMD_SCHEME_MOUSE_CLICK,
  CMD_SCHEME_MOUSE_LEAVE,
  CMD_SCHEME_MOUSE_MOVE,
  CMD_SCHEME_MOUSE_UP,
  CMD_VALENCE_POINT_CLICKED,
  CMD_VALENCE_POINT_CONTEXT_MENU,
} from '../../scheme/scheme-commands.js';
import type { Scheme } from '../../scheme/scheme.js';
import { TOKEN_ICONS_TRANSFER_SERVICE } from './icons-transfer.service.token.js';
import { EVENT_MODE_CHANGED } from '../../scheme/scheme-events.js';

// Every handler here is a thin wrapper around an `IconsTransferService` method so tests can drive the service
// directly without a DOM (see `icons-transfer.test.ts`).
export const initIconsTransferHandlers = (baseScheme: Scheme) => {
  baseScheme.commands.registerCommand(
    CMD_ICON_MOUSE_CLICK,
    ({ icon, e }, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      const returnValue = service.iconClicked(icon, scheme, e.shiftKey);
      if (returnValue) e.stopPropagation();
      return returnValue;
    },
    4,
  );
  baseScheme.commands.registerCommand(
    CMD_ICON_MOUSE_DOWN,
    ({ icon, e }, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      return service.mouseDown(icon, e, scheme);
    },
    4,
  );
  // Priority 1: above mouse-navigation's panning handler (0) so an active drag consumes the move instead of also
  // panning the canvas, below the priority-4 handler in register-scheme-commands.ts that updates scheme.mousePosition.
  baseScheme.commands.registerCommand(
    CMD_SCHEME_MOUSE_MOVE,
    (_, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      return service.mouseMove(scheme);
    },
    1,
  );
  baseScheme.commands.registerCommand(
    CMD_SCHEME_MOUSE_UP,
    (_, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      return service.mouseUp(scheme);
    },
    1,
  );
  baseScheme.commands.registerCommand(
    CMD_SCHEME_MOUSE_LEAVE,
    (_, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      return service.mouseLeave(scheme);
    },
    1,
  );
  baseScheme.commands.registerCommand(
    CMD_ICON_MOUSE_DOUBLE_CLICK,
    (_, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      service.cancel(scheme);
      return false;
    },
    4,
  );
  baseScheme.commands.registerCommand(
    CMD_ICON_CONTEXT_MENU,
    (_, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      service.cancel(scheme);
      return false;
    },
    4,
  );
  baseScheme.commands.registerCommand(
    CMD_VALENCE_POINT_CLICKED,
    ({ vp }, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      return service.valencePointClicked(vp, scheme);
    },
    4,
  );
  baseScheme.commands.registerCommand(
    CMD_VALENCE_POINT_CONTEXT_MENU,
    (_, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      service.cancel(scheme);
      return false;
    },
    4,
  );
  baseScheme.commands.registerCommand(
    CMD_SCHEME_MOUSE_CLICK,
    (_, scheme) => {
      const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
      return service.schemeClicked(scheme);
    },
    4,
  );

  baseScheme.events.subscribeEvent(EVENT_MODE_CHANGED, ({ oldMode, newMode }, scheme) => {
    const service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
    service.modeChanged(oldMode, newMode, scheme);
    return false;
  });
};
