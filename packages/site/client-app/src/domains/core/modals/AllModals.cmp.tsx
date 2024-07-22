import React from 'react'
import { AlertModalComponent } from './alert/Alert.modal.cmp';
import { ChangePasswordModalComponent } from './change-password/ChangePassword.modal.cmp';
import { ConfirmModalComponent } from './confirm/Confirm.modal.cmp';
import { DocumentInfoModalComponent } from './document-info/DocumentInfo.modal.cmp';
import { DocumentSettingsModalComponent } from './document-settings/DocumentSettings.modal.cmp';
import { LoginModalComponent } from './login/Login.modal.cmp';
import { ModalsStore } from './ModalsStore';
import { RegisterModalComponent } from './register/Register.modal.cmp';
import { ResetPasswordModalComponent } from './reset-password/ResetPassword.modal.cmp';

export const AllModals: React.FC<{ modals: ModalsStore }> = ({ modals }) => <>
  <AlertModalComponent modal={modals.alert} />
  <ConfirmModalComponent modal={modals.confirm} />
  <LoginModalComponent modal={modals.login} />
  <RegisterModalComponent modal={modals.register} />
  <ChangePasswordModalComponent modal={modals.changePassword} />
  <ResetPasswordModalComponent modal={modals.resetPassword} />
  <DocumentSettingsModalComponent modal={modals.documentSettings} />
  <DocumentInfoModalComponent modal={modals.documentInfo} />
</>;
