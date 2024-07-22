import { action, makeObservable, observable, override } from "mobx";
import { ModalModel } from '../base/Modal.model';
import type { ModalsStore } from "../ModalsStore";

type TCallback = (Alerted: boolean) => void;

export class AlertModalModel extends ModalModel {

  @observable text = "";
  private callback: TCallback | null = null;

  constructor(modalState: ModalsStore) {
    super({
      modals: modalState,
      name: 'Alert',
      size: 'sm',
    });
    makeObservable(this);
  }

  @override reset() {
    super.reset();
    this.text = '';
  }

  @action showAlert(text: string, callback?: TCallback): void {
    super.show();
    this.text = text;
    this.callback = callback || null;
  }

  @action ok() {
    super.close();
    if (this.callback) {
      this.callback(true);
    }
    this.callback = null;
  }
}