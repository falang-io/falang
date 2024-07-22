import { runInAction } from 'mobx';
import { observer } from "mobx-react"
import { Modal } from '../base/Modal.cmp';
import { ModalFormField } from '../base/ModalFormField.cmp';
import { ResetPasswordModalModel } from "./ResetPassword.modal.model"
import { InputGroup, FormGroup, Button } from '@blueprintjs/core';

type TFC = React.FC<{ modal: ResetPasswordModalModel }>;

const Content: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <>
    <ModalFormField modal={modal} property="email" label={t('user:email')}>
      <InputGroup
        placeholder={t('user:email') || ''}
        value={modal.email}
        onChange={(e) => runInAction(() => modal.email = e.target.value)}
      />
    </ModalFormField>
  </>
});

const Footer: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <>
    <Button onClick={() => modal.close()}>{t('button:cancel')}</Button>
    <Button intent="primary" onClick={() => modal.send()}>{t('user:restore')}</Button>
  </>
});

export const ResetPasswordModalComponent: TFC = ({ modal }) =>
  <Modal
    Content={Content}
    Footer={Footer}
    modal={modal}
  />;
