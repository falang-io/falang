import { IContextMenuItem } from '@falang/frontend-core';
import type { MenuItemConstructorOptions} from 'electron';

export const buildMenu = (menu: IContextMenuItem[]): [MenuItemConstructorOptions[], Record<string, IContextMenuItem>] => {
  const byIds: Record<string, IContextMenuItem> = {};
  let id = 0;

  const buildMenuPrivate = (oldMenu: IContextMenuItem[]): MenuItemConstructorOptions[] => {    
    const newMenu: MenuItemConstructorOptions[] = [];
    oldMenu.forEach((menuItem) => {
      id++;
      const stringId = id.toString();
      byIds[stringId] = menuItem;
      const newMenuItem: MenuItemConstructorOptions = {
        id: stringId,
        label: menuItem.text,
        accelerator: menuItem.accelerator,
      };
      if(menuItem.children) {
        newMenuItem.submenu = buildMenuPrivate(menuItem.children);
      }
      newMenu.push(newMenuItem);
    });
    return newMenu;
  };

  return [buildMenuPrivate(menu), byIds];
}