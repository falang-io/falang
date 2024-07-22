import { runInAction } from 'mobx';
import { observer } from "mobx-react"
import { Modal } from '../base/Modal.cmp';
import { ModalFormField } from '../base/ModalFormField.cmp';
import { ChangePasswordModalModel } from "./ChangePassword.modal.model"
import { InputGroup, Button } from '@blueprintjs/core';

type TFC = React.FC<{ modal: ChangePasswordModalModel }>;

const Content: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <>
    {modal.type === 'from-profile' ? 
      <ModalFormField modal={modal} property="oldPassword" label={t('user:old-password')}>
        <InputGroup
          type='password'
          placeholder={'***'}
          value={modal.oldPassword}
          onChange={(e) => runInAction(() => modal.oldPassword = e.target.value)}
        />
      </ModalFormField> 
      : null}
    <ModalFormField modal={modal} property="newPassword" label={t('user:new-password')}>
      <InputGroup
        type='password'
        placeholder={'***'}
        value={modal.newPassword}
        onChange={(e) => runInAction(() => modal.newPassword = e.target.value)}
      />
    </ModalFormField>
    <ModalFormField modal={modal} property="newPasswordConfirm" label={t('user:repeat-new-password')}>
      <InputGroup
        type='password'
        placeholder={'***'}
        value={modal.newPasswordConfirm}
        onChange={(e) => runInAction(() => modal.newPasswordConfirm = e.target.value)}
      />
    </ModalFormField>
  </>;
});

const Footer: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <>
    {modal.type === 'from-profile' ? <>
      <Button onClick={() => modal.close()}>{t('button:cancel')}</Button>   
    </> : null}
    <Button intent="primary" onClick={() => modal.send()}>{t('user:change-password')}</Button>
  </>
});

export const ChangePasswordModalComponent: React.FC<{ modal: ChangePasswordModalModel }> = ({ modal }) =>
  <Modal
    Content={Content}
    Footer={Footer}
    modal={modal}
  />;
