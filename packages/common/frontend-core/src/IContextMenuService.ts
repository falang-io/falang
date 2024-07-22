export interface IContextMenuItem {
  text: string
  onClick?: () => void
  children?: IContextMenuItem[]
  accelerator?: string
}

export interface IContextMenuService {
  showMenu(menu: IContextMenuItem[], x: number, y: number): void;
}