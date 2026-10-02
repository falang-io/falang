export interface IContextMenuGroup {
  type: 'group';
  text: string;
  children: IContextMenuItem[];
}

export interface IContextMenuButton {
  type: 'button';
  text: string;
  onClick: () => void;
  /** `text` is already display text — never run it through `t()` (it may contain `:`/`.`, which i18next reads as namespace/key separators). */
  raw?: boolean;
}

export type IContextMenuItem = IContextMenuGroup | IContextMenuButton;
