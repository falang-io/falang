import { observer } from "mobx-react"
import { Modal } from '../base/Modal.cmp';
import { ConfirmModalModel } from "./Confirm.modal.model"
import { Button } from '@blueprintjs/core';

type TFC = React.FC<{ modal: ConfirmModalModel }>;

const Content: TFC = observer(({ modal }) => <>{modal.text}</>);

const Footer: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t
  return <>
    <Button intent="primary" onClick={() => modal.ok()}>{t('button:yes')}</Button>
    <Button onClick={() => modal.cancel()}>{t('button:no')}</Button>  
  </>;
});

export const ConfirmModalComponent: TFC = ({ modal }) => 
  <Modal 
    Content={Content}
    Footer={Footer}
    modal={modal}
  />;