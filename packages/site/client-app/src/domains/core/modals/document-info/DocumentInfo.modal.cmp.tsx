import { observer } from "mobx-react";
import React from 'react';
import { Modal } from '../base/Modal.cmp';
import { DocumentInfoModalModel } from "./DocumentInfo.modal.model"
import { Button } from '@blueprintjs/core';

type TFC = React.FC<{ modal: DocumentInfoModalModel }>;

const Content: TFC = observer(({ modal }) => {
  return <>
    <h2>{modal.modals.root.documentEditorPage.editor.name}</h2>
    <p>{modal.root.i18n.t('base:author')}: {modal.modals.root.documentEditorPage.authorUsername}</p>
    <p style={{ whiteSpace: 'pre-wrap' }}>{modal.modals.root.documentEditorPage.description}</p>
  </>
});

const Footer: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <Button intent="primary" onClick={() => modal.close()}>{t('button:close')}</Button>
});

export const DocumentInfoModalComponent: TFC = ({ modal }) =>
  <Modal
    Content={Content}
    Footer={Footer}
    modal={modal}
  />;
