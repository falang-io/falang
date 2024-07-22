import { action, makeObservable, observable, override } from "mobx";
import { api } from '../../../api/api';
import { ModalModel } from '../base/Modal.model';
import type { ModalsStore } from "../ModalsStore";

export class ResetPasswordModalModel extends ModalModel {
  @observable email = '';

  constructor(modals: ModalsStore) {
    super({
      modals,
      name: ResetPasswordModalModel.name,
      size: 'sm',
    });
    makeObservable(this);
  }

  @override reset(): void {
    super.reset();
    this.email = '';
  }

  @action send(): void {
    const email = this.email;
    this.inBusy(async () => {
      if(!email) {
        throw new Error('Empty email');
      }
      const result = await api.user.registration.resetPasswordStart({ email });
      if(!result.success) throw new Error('Unknown error');
      this.modals.alert.showAlert(`Instructions was sent to ${email}`);
    });
  }
}
