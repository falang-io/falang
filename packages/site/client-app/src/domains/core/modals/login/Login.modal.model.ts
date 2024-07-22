import { action, makeObservable, observable, override } from "mobx";
import { api } from '../../../api/api';
import { ModalModel } from '../base/Modal.model';
import type { ModalsStore } from "../ModalsStore";

export class LoginModalModel extends ModalModel {

  @observable username = "";
  @observable password = "";

  constructor(public modalState: ModalsStore) {
    super({
      modals: modalState,
      name: 'Login',
      width: 330,
    });
    makeObservable(this);
  }

  @override reset() {
    this.username = '';
    this.password = '';
    super.reset();
  }

  @action send() {
    this.inBusy(async () => {
      const result = await api.user.session.login({
        username: this.username,
        password: this.password,
      });
      if(!result.loggedIn) {
        throw new Error("Wrong username or password");
      }
      this.modalState.root.user.setState(result);
      this.modals.closeAll();
    });  
  }

  @action cancel() {
    this.modalState.closeAll();
  }
}