import { action, makeObservable, observable, override } from "mobx";
import { api } from '../../../api/api';
import { ModalModel } from '../base/Modal.model';
import type { ModalsStore } from "../ModalsStore";

type TChangePasswordType = 'from-profile' | 'from-code';

export class ChangePasswordModalModel extends ModalModel {
  @observable oldPassword = '';
  @observable newPassword = '';
  @observable newPasswordConfirm = '';
  @observable type: TChangePasswordType = 'from-profile'

  constructor(modals: ModalsStore) {
    super({
      modals,
      name: 'ChangePassword',
      size: 'sm',
    });
    makeObservable(this);
  }

  @override reset(): void {
    super.reset();
    this.oldPassword = '';
    this.newPassword = '';
    this.newPasswordConfirm = '';
    this.type = 'from-profile';
  }

  @action send(): void {
    const newPassword = this.newPassword;
    const newPasswordConfirm = this.newPasswordConfirm;
    const oldPassword = this.oldPassword;
    const type = this.type;
    this.inBusy(async () => {
      if(newPassword !== newPasswordConfirm) {
        throw new Error('Password confirmation should match password');
      }
      if(!newPassword.length) {
        throw new Error('Empty password');
      }
      let result: any;
      if(type === 'from-profile') {
        result = await api.user.profile.changePassword({
          newPassword: newPassword,
          oldPassword: oldPassword,
        });
      } else {
        result = await api.user.registration.resetPasswordFinish({
          code: this.root.activationCode || '',
          newPassword: newPassword,
        })
      }
      if(!result.success) throw new Error('Unknown error');
      this.modals.alert.showAlert('Password changed');
    });
  }

  @action showForType(type: TChangePasswordType) {
    this.show();
    this.type = type;
  }
}
