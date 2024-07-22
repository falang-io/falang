import { MenuItemConstructorOptions } from 'electron';

export interface IMainContextMenuService {
  showMenu(params: MenuItemConstructorOptions[]): Promise<string | undefined | null>
}