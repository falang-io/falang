import { IContextMenuItem, IContextMenuService } from '@falang/frontend-core';
import { BrowserWindow, dialog, Menu, MenuItemConstructorOptions } from 'electron';
import { IMainContextMenuService } from '../common/IMainContextMenu.service';

export class ContextMenuService implements IMainContextMenuService {
  constructor(readonly win?: BrowserWindow) {}

  showMenu = async (menu: MenuItemConstructorOptions[]): Promise<string | undefined | null> => {
    return new Promise<string | undefined | null>((resolve) => {
      let sent = false;
      const attachEvents = (items: MenuItemConstructorOptions[]) => {
        items.forEach((item) => {
          item.click = () => {
            //console.log('Click', sent);
            if (sent) return;
            sent = true;
            resolve(item.id);
          }
          if (item.submenu && Array.isArray(item.submenu)) {
            attachEvents(item.submenu);
          }
        });
      }
      attachEvents(menu);
      const contextMenu = Menu.buildFromTemplate(menu);
      contextMenu.on('menu-will-close', (event) => {
        event.preventDefault();
        //win.webContents.focus();
        setTimeout(() => {
          if (!sent) {
            sent = true;
            resolve(null);
          }
        }, 100);
      });
      contextMenu.popup({
        window: this.win,
      });
    });
    
  }
}