import type { IContextMenuItem } from '@falang/scheme';
import type { ItemType } from 'antd/es/menu/interface';
import { action, makeObservable, observable } from 'mobx';

export class AntContextMenuService {
  @observable opened = false;
  @observable.ref menu: ItemType[] = [];
  @observable x = 0;
  @observable y = 0;

  constructor() {
    makeObservable(this);
  }

  @action show(menu: IContextMenuItem[], x: number, y: number) {
    if (menu.length === 0) {
      this.hide();
      return;
    }
    this.menu = this.buildMenu(menu);
    this.opened = true;
    this.x = x - 5;
    this.y = y - 5;
  }

  private buildMenu(menu: IContextMenuItem[], parentKey = ''): ItemType[] {
    return menu.map((item, index) => this.buildItem(item, `${parentKey}-${String(index)}`));
  }

  private buildItem(item: IContextMenuItem, key: string): ItemType {
    if (item.type === 'group') {
      return {
        label: item.text,
        key,
        children: this.buildMenu(item.children, key),
      };
    }
    return {
      key,
      label: item.text,
      onClick: () => {
        this.hide();
        item.onClick();
      },
    };
  }

  @action hide() {
    this.menu = [];
    this.opened = false;
  }
}
