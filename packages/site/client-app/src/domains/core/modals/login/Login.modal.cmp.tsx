import { runInAction } from 'mobx';
import { observer } from "mobx-react"
import { Modal } from '../base/Modal.cmp';
import { ModalFormField } from '../base/ModalFormField.cmp';
import { LoginModalModel } from "./Login.modal.model"
import { InputGroup, FormGroup, Button } from '@blueprintjs/core';

const LoginModalContent: React.FC<{ modal: LoginModalModel }> = observer(({ modal }) => {
  const t = modal.modalState.root.i18n.t;
  return <>
    <ModalFormField modal={modal} label={`${t('user:username')} / ${t('user:email')}`} property="username">
      <InputGroup
        placeholder={t('user:username') || ''}
        value={modal.username}
        onChange={(e) => runInAction(() => modal.username = e.target.value)}
      />
    </ModalFormField>
    <ModalFormField modal={modal} property="password" label={t('user:password')}>
      <InputGroup
        type='password'
        placeholder="***"
        value={modal.password}
        onChange={(e) => runInAction(() => modal.password = e.target.value)}
      />
    </ModalFormField>
    <FormGroup>
      {t('user:not-registered')}?
      &nbsp;
      <Button
        className="btn btn-sm"
        onClick={() => runInAction(() => modal.modalState.register.show())}>
        {t('user:register')}
      </Button>
    </FormGroup>
    <FormGroup>
      {t('user:is-forgot-your-password')}
      &nbsp;
      <Button
        className="btn btn-sm"
        onClick={() => runInAction(() => modal.modalState.resetPassword.show())}>
        {t('user:restore')}
      </Button>
    </FormGroup>
  </>
});

const LoginModalFooter: React.FC<{ modal: LoginModalModel }> = observer(({ modal }) => {
  const t = modal.modalState.root.i18n.t;
  return <>
    <Button onClick={() => modal.cancel()}>{t('button:cancel')}</Button>
    &nbsp;
    <Button intent='primary' onClick={() => modal.send()}>{t('button:login')}</Button>
  </>;
});

export const LoginModalComponent: React.FC<{ modal: LoginModalModel }> = ({ modal }) =>
  <Modal
    Content={LoginModalContent}
    Footer={LoginModalFooter}
    modal={modal}
  />;
