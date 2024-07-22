import { makeObservable, observable } from "mobx"
import { BaseStore } from '../store/Base.store';
import type { RootStore } from '../store/Root.store';
import { AlertModalModel } from "./alert/Alert.modal.model"
import { ChangePasswordModalModel } from './change-password/ChangePassword.modal.model';
import { ConfirmModalModel } from "./confirm/Confirm.modal.model"
import { DocumentInfoModalModel } from './document-info/DocumentInfo.modal.model';
import { DocumentSettingsModalModel } from './document-settings/DocumentSettings.modal.model';
import { LoginModalModel } from './login/Login.modal.model';
import { RegisterModalModel } from './register/Register.modal.model';
import { ResetPasswordModalModel } from './reset-password/ResetPassword.modal.model';

export class ModalsStore extends BaseStore {
  @observable visibleModalName = ""
  readonly alert: AlertModalModel
  readonly changePassword: ChangePasswordModalModel
  readonly confirm: ConfirmModalModel  
  readonly login: LoginModalModel
  readonly register: RegisterModalModel
  readonly resetPassword: ResetPasswordModalModel
  readonly documentSettings: DocumentSettingsModalModel;
  readonly documentInfo: DocumentInfoModalModel;

  constructor(root: RootStore) {
    super(root);
    this.confirm = new ConfirmModalModel(this);
    this.alert = new AlertModalModel(this);
    this.login = new LoginModalModel(this);
    this.register = new RegisterModalModel(this);
    this.changePassword = new ChangePasswordModalModel(this);
    this.resetPassword = new ResetPasswordModalModel(this);
    this.documentSettings = new DocumentSettingsModalModel(this);
    this.documentInfo = new DocumentInfoModalModel(this);
    makeObservable(this);
  }

  closeAll() {
    this.visibleModalName = '';
  }

  enterClicked() {
    if (this.visibleModalName === 'confirm') {
      this.confirm.ok();
    }
    if (this.visibleModalName === 'alert') {
      this.alert.ok();
    }
  }

  escapeClicked() {
    if (this.visibleModalName === 'confirm') {
      this.confirm.cancel();
    }
    if (this.visibleModalName === 'alert') {
      this.closeAll();
    }
  }
}