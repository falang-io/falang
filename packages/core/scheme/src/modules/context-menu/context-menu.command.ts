import { createCommand } from '../../scheme/scheme-commands.js';
import type { IContextMenuItem } from '../../types/context-menu.js';

export interface IShowContextMenuCommandParams {
  e: React.MouseEvent<HTMLDivElement, MouseEvent>;
  menu: IContextMenuItem[];
}

export const CMD_SHOW_CONTEXT_MENU = createCommand<IShowContextMenuCommandParams>('SHOW_CONTEXT_MENU');
