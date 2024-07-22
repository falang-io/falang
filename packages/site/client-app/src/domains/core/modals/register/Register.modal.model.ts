import { action, makeObservable, observable, override } from "mobx";
import { api } from '../../../api/api';
import { ModalModel } from '../base/Modal.model';
import type { ModalsStore } from "../ModalsStore";

export class RegisterModalModel extends ModalModel {

  @observable username = "";
  @observable email = "";

  constructor(modalState: ModalsStore) {
    super({
      modals: modalState,
      name: 'Register',
      size: 'sm',
    });
    makeObservable(this);
  }

  @override reset() {
    this.username = "";
    this.email = "";
    super.reset();
  }

  send() {
    this.inBusy(async () => {
      const result = await api.user.registration.start({
        username: this.username,
        email: this.email,
      });
      if (!result.success) throw new Error('Unknown error');
      this.modals.alert.showAlert(`Activation link was sent to ${this.email}. Please check your mailbox.`);
    })
  }

  @action cancel() {
    this.modals.closeAll();
  }
}
