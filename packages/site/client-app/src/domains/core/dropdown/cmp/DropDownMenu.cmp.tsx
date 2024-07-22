import type { IContextMenuItem } from '@falang/frontend-core';
import { DropDownMenuStore } from '../store/DropDownMenuState';
import { observer } from 'mobx-react';
import { MenuItem, Menu } from '@blueprintjs/core';

const buildMenu = (
  items: IContextMenuItem[],
  dd: DropDownMenuStore,
) => items.map((item) => {
  return <MenuItem
    text={item.text}
    onClick={() => {
      item.onClick && item.onClick();
      dd.hide();
    }}
    key={item.text}
  >
    {item.children ? buildMenu(item.children, dd) : null}
  </MenuItem>
});

export const DropDownMenuComponent: React.FC<{
  dd: DropDownMenuStore
}> = observer(({ dd }) => {
  return <Menu
    style={dd.style}
    hidden={!dd.visible}
    tabIndex={0}
    id='DropDownMenuComponent'
    onBlur={() => dd.hide()}
  >
    {buildMenu(dd.menuItems, dd)}
  </Menu>
});
