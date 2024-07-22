import { runInAction } from 'mobx';
import { observer } from "mobx-react"
import { Modal } from '../base/Modal.cmp';
import { ModalFormField } from '../base/ModalFormField.cmp';
import { RegisterModalModel } from "./Register.modal.model"
import { InputGroup, FormGroup, Button } from '@blueprintjs/core';

type TFC = React.FC<{ modal: RegisterModalModel }>;

const Content: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <>
    <ModalFormField 
      modal={modal}
      property="username"
      label={t('user:username')}
      helperText='a-z, A-Z, 0-9, "_", "-"'
    >
      <InputGroup
        placeholder={t('user:username') || ''}
        value={modal.username}
        onChange={(e) => runInAction(() => modal.username = e.target.value)}
      />
    </ModalFormField>
    <ModalFormField modal={modal} property="email" label={t('user:email')}>
      <InputGroup
        placeholder={t('user:email') || ''}
        value={modal.email}
        onChange={(e) => runInAction(() => modal.email = e.target.value)}
      />
    </ModalFormField>
  </>;
});

const Footer: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <>
    <Button onClick={() => modal.cancel()}>{t('button:cancel')}</Button>
    <Button intent='primary' onClick={() => modal.send()}>{t('user:register')}</Button>
  </>;
});

export const RegisterModalComponent: TFC = ({ modal }) => 
  <Modal
    Content={Content}
    Footer={Footer}
    modal={modal}
  />;
