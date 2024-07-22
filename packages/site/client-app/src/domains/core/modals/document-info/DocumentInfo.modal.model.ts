import { action, makeObservable, observable, override } from "mobx";
import { ModalModel } from '../base/Modal.model';
import type { ModalsStore } from "../ModalsStore";

export class DocumentInfoModalModel extends ModalModel {

  @observable text = "";

  constructor(modalState: ModalsStore) {
    super({
      modals: modalState,
      name: 'DocumentInfo',
    });
    makeObservable(this);
  }

  @override reset() {
    super.reset();
    this.text = '';
  }
}