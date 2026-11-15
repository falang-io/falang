import { action, makeObservable, observable } from 'mobx';
import type { IItemPickerModalItem } from './item-picker-modal.cmp.js';

export class AntItemPickerModalService {
  @observable opened = false;
  @observable.ref items: readonly IItemPickerModalItem[] = [];

  constructor() {
    makeObservable(this);
  }

  @action show(items: readonly IItemPickerModalItem[]) {
    this.items = items;
    this.opened = true;
  }

  @action hide() {
    this.opened = false;
    this.items = [];
  }
}
