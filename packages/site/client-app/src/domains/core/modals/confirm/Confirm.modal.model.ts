import { action, makeObservable, observable, override } from "mobx";
import { ModalModel } from '../base/Modal.model';
import type { ModalsStore } from "../ModalsStore";

type TCallback = (confirmed: boolean) => void;

export class ConfirmModalModel extends ModalModel {

    @observable text = "";
    private callback: TCallback | null = null;

    constructor(modalState: ModalsStore) {
      super({
        modals: modalState,
        name: 'Confirm',
        size: 'sm',
      });
      makeObservable(this);
    }

    @override reset() {
      this.text = '';
      super.reset();
    }

    @action ok() {
        this.modals.closeAll();
        if (this.callback) {
            this.callback(true);
        }
        this.callback = null;
    }

    @action cancel() {
        this.modals.closeAll();
        if (this.callback) {
            this.callback(false);
        }
        this.callback = null;
    }

    @action ask(question: string, cb: TCallback) {
      super.show();
      this.text = question;
      this.callback = cb;
    }
}