import { resolveService } from '@falang/di';
import {
  CMD_ICON_MOUSE_CLICK,
  CMD_ICON_MOUSE_DOUBLE_CLICK,
  CMD_ICON_MOUSE_MOVE,
  CMD_SCHEME_MOUSE_CLICK,
} from '../../scheme/scheme-commands.js';
import type { Scheme } from '../../scheme/scheme.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from './editor.service.token.js';
import { EDITING_INLINE_MODE_NAME } from './constants.js';
import { DEFAULT_MODES } from '../../types/toolbar-icon.js';
import { EVENT_MODE_CHANGED } from '../../scheme/scheme-events.js';
import { EditorComponent } from './editor.cmp.js';

export const initEditorHandlers = (baseScheme: Scheme) => {
  baseScheme.commands.registerCommand(
    CMD_ICON_MOUSE_CLICK,
    ({ e, icon }, scheme) => {
      if (!scheme.isEditing) return false;
      const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
      if (scheme.mode.value !== EDITING_INLINE_MODE_NAME) return false;
      if (service.editingId === icon.id) {
        e.stopPropagation();
        return true;
      }
      service.stopEdit(scheme, true);
      const returnValue = service.setIconForEdit(icon, scheme);
      if (returnValue) {
        e.stopPropagation();
        scheme.mode.setMode(EDITING_INLINE_MODE_NAME);
      }
      return returnValue;
    },
    4,
  );

  baseScheme.commands.registerCommand(CMD_ICON_MOUSE_DOUBLE_CLICK, ({ e, icon }, scheme) => {
    if (!scheme.isEditing) return false;
    const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
    if (scheme.mode.value !== DEFAULT_MODES.START && scheme.mode.value !== EDITING_INLINE_MODE_NAME) return false;
    if (service.editingId === icon.id) {
      e.stopPropagation();
      return true;
    }
    service.stopEdit(scheme, true);
    const returnValue = service.setIconForEdit(icon, scheme);
    if (returnValue) {
      e.stopPropagation();
      scheme.mode.setMode(EDITING_INLINE_MODE_NAME);
    }
    return returnValue;
  });

  baseScheme.commands.registerCommand(
    CMD_SCHEME_MOUSE_CLICK,
    (_, scheme) => {
      if (scheme.mode.value !== EDITING_INLINE_MODE_NAME) return false;
      scheme.mode.setMode(DEFAULT_MODES.START);
      return true;
    },
    0,
  );

  baseScheme.events.subscribeEvent(EVENT_MODE_CHANGED, ({ oldMode, newMode }, scheme) => {
    const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
    if (oldMode === EDITING_INLINE_MODE_NAME) {
      scheme.extraView.setBlockExtraView(null);
      service.stopEdit(scheme, true);
    }
    if (newMode === EDITING_INLINE_MODE_NAME) {
      scheme.extraView.setBlockExtraView(EditorComponent);
    }
    return false;
  });

  baseScheme.commands.registerCommand(
    CMD_ICON_MOUSE_MOVE,
    ({ e }, scheme) => {
      if (scheme.mode.value !== EDITING_INLINE_MODE_NAME) return false;
      e.stopPropagation();
      return true;
    },
    0,
  );
};
