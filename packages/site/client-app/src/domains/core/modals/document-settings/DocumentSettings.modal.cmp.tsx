import { runInAction } from 'mobx';
import { observer } from "mobx-react"
import { TDocumentVisibility } from '../../../api';
import { Modal } from '../base/Modal.cmp';
import { ModalFormField } from '../base/ModalFormField.cmp';
import { DocumentSettingsModalModel } from "./DocumentSettings.modal.model";
import { InputGroup, TextArea, RadioGroup, Radio, Button } from '@blueprintjs/core';

const visibilityList: TDocumentVisibility[] = ['private', 'link', 'public'];

type TFC = React.FC<{ modal: DocumentSettingsModalModel }>;

const Content: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <>
    <ModalFormField modal={modal} property="name" label={t('base:name')}>
      <InputGroup
        value={modal.documentName}
        onChange={(e) => runInAction(() => modal.documentName = e.target.value)}
      />
    </ModalFormField>
    <ModalFormField modal={modal} property="description" label={t('docs:description')}>
      <TextArea
        value={modal.description}
        style={{
          height: '150px',
          width: '100%',
        }}
        onChange={(e) => runInAction(() => modal.description = e.target.value)}
      />
    </ModalFormField>
    <ModalFormField
      modal={modal}
      property="visibility"
      label={t('docs:visibility')}
    >
      <RadioGroup
        onChange={(e) => {
          modal.visibility = e.currentTarget.value as TDocumentVisibility;
        }}
      >
        {visibilityList.map(visibility => <div key={visibility}>
          <Radio
            value={visibility}
            onChange={(e) => {
              runInAction(() => {
                modal.visibility = visibility;
              });
            }}
            checked={visibility === modal.visibility}
            label={`${t(`docs:visibility_${visibility}`)} (${t(`docs:visibility_${visibility}_description`)})`}
          />
        </div>)}
      </RadioGroup>
    </ModalFormField>

  </>;
});

const Footer: TFC = observer(({ modal }) => {
  const t = modal.root.i18n.t;
  return <>
    <Button onClick={() => modal.cancel()}>{t('button:cancel')}</Button>
    <Button intent="primary" onClick={() => modal.save()}>{t('button:save')}</Button>
  </>;
});

export const DocumentSettingsModalComponent: TFC = ({ modal }) =>
  <Modal
    Content={Content}
    Footer={Footer}
    modal={modal}
  />;
