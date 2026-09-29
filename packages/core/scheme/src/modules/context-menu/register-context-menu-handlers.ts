import { resolveService } from '@falang/di';
import { CMD_ICON_CONTEXT_MENU, CMD_VALENCE_POINT_CONTEXT_MENU } from '../../scheme/scheme-commands.js';
import type { Scheme } from '../../scheme/scheme.js';
import { TOKEN_CONTEXT_MENU } from './context-menu.service.token.js';
import { CMD_SHOW_CONTEXT_MENU } from './context-menu.command.js';

export const registerContextMenuHandlers = (baseScheme: Scheme) => {
  baseScheme.commands.registerCommand(CMD_ICON_CONTEXT_MENU, ({ e, icon }, scheme) => {
    if (!scheme.isEditing) return false;
    const service = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const menu = service.buildForIcon({ icon, scheme });
    if (menu.length === 0) return false;
    e.preventDefault();
    e.stopPropagation();
    scheme.commands.dispatchCommand(CMD_SHOW_CONTEXT_MENU, { e, menu });
    return true;
  });

  baseScheme.commands.registerCommand(CMD_VALENCE_POINT_CONTEXT_MENU, ({ e, vp }, scheme) => {
    if (!scheme.isEditing) return false;
    const service = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const parent = scheme.icons.getIcon(vp.parentId);
    const menu = service.buildForValencePoint({ parent, scheme, vp });
    if (menu.length === 0) return false;
    scheme.commands.dispatchCommand(CMD_SHOW_CONTEXT_MENU, { e, menu });
    return true;
  });
};
