import { action, computed, makeObservable, observable, runInAction } from "mobx";
import React from "react";
import { BaseStore } from '../../store/Base.store';
import { RootStore } from '../../store/Root.store';
import type { IContextMenuItem, IContextMenuService } from '@falang/frontend-core';

export type TDropDownMenuData = IContextMenuItem[];


type TPosition = 'bottomLeft' | 'bottomRight';

export class DropDownMenuStore extends BaseStore implements IContextMenuService {
  readonly menuItems = observable<IContextMenuItem>([]);
  @observable visible = false;
  @observable x: number | null = null;
  @observable y = 0;
  @observable right: number | null = null;
  @observable position: TPosition = 'bottomLeft';


  constructor(root: RootStore) {
    super(root);
    makeObservable(this);
  }

  /*@action showForIcon(iconId: string) {
    const icon = this.editorState.getIcon(iconId);
    const menu = icon.getMenu();
    this.menuItems.replace(menu);
    if (menu.length) this.visible = true;
  }*/

  @action showMenu(menu: IContextMenuItem[], x: number, y: number): void {
    this.menuItems.replace(menu);
    if (menu.length) {
      this.position = 'bottomRight';
      this.x = x;
      this.y = y;
      this.right = null;
      this.visible = true;
      setTimeout(() => {
        document.getElementById('DropDownMenuComponent')?.focus();
      }, 10);
    }
  }

  @action showForElement(
    e: React.BaseSyntheticEvent,
    menu: IContextMenuItem[],
    position: TPosition = 'bottomLeft',
  ) {
    const target = e.target;
    let x: number | null = null;
    let y: number | null = null;
    let right: number | null = null;
    if (target instanceof HTMLButtonElement) {
      const rect = target.getBoundingClientRect();
      y = rect.y + rect.height - 3;
      switch (position) {
        case 'bottomLeft':
          x = rect.x;
          right = null;
          break;
        case 'bottomRight':
          x = null;
          right = 0;
          break;
      }
    }
    if ((x === null && right === null) || y === null) {
      throw new Error('Position for menu not defined');
    }
    this.menuItems.replace(menu);
    if (menu.length) {
      this.position = position;
      this.x = x;
      this.y = y;
      this.right = right;
      this.visible = true;
    }
  }

  hide() {
    setTimeout(() => {
      runInAction(() => {
        this.visible = false;
      })
    }, 100);
  }

  @computed get className() {
    const isVisible = this.visible;
    const isRight = this.position === 'bottomRight';
    return `dropdown${isVisible ? ' active' : ''}${isRight ? ' dropdown-right' : ''}`;
  }

  @computed.struct get style(): React.CSSProperties {
    const style: React.CSSProperties = {
      top: this.y,
      position: 'absolute',
      width: 'auto',
    }
    if (this.x !== null) {
      style.left = this.x;
    }
    if (this.right !== null) {
      style.right = this.right;
    }
    return style;
  }
}