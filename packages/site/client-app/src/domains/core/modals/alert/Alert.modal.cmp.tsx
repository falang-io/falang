import { observer } from "mobx-react";
import React from 'react';
import { Modal } from '../base/Modal.cmp';
import { AlertModalModel } from "./Alert.modal.model"
import { Button } from '@blueprintjs/core';

type TFC = React.FC<{ modal: AlertModalModel }>;

const Content: TFC = observer(({ modal }) => <>{modal.text}</>);

const Footer: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <Button intent="primary" onClick={() => modal.ok()}>{t('button:ok')}</Button>
});

export const AlertModalComponent: TFC = ({ modal }) => 
  <Modal
    Content={Content}
    Footer={Footer}
    modal={modal}
  />;
