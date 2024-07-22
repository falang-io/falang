import { action, computed, makeObservable } from 'mobx';
import { DialogsState } from './DialogsState';

export abstract class BaseDialogState {
  constructor(readonly dialogs: DialogsState) {
    makeObservable(this);
  }

  @computed get isOpen(): boolean {
    return this.name === this.dialogs.openedDialogName;
  }

  @action protected showBase() {
    this.dialogs.openedDialogName = this.name;
  }

  @action hide() {
    this.dialogs.openedDialogName = null;
  }

  abstract get name(): string;
}