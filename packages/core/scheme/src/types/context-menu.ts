export interface IContextMenuGroup {
  type: 'group';
  text: string;
  children: IContextMenuItem[];
}

export interface IContextMenuButton {
  type: 'button';
  text: string;
  onClick: () => void;
}

export type IContextMenuItem = IContextMenuGroup | IContextMenuButton;
