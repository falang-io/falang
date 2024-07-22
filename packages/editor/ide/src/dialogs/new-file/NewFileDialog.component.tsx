import { Button, Dialog, DialogBody, DialogFooter, FormGroup, InputGroup, Radio, RadioGroup } from '@blueprintjs/core'
import { NewFileDialogState } from './NewFileDialogState'
import { observer } from 'mobx-react';

export const NewFileDialogComponent: React.FC<{ dialog: NewFileDialogState }> = observer(({ dialog }) => {
  const t = dialog.dialogs.ide.frontRoot.lang.t;
  return <Dialog 
    title={t('file:new-file')}
    isOpen={dialog.isOpen}
    onClose={() => dialog.hide()}
    style={{width: 400}}
  >
    <DialogBody>
      {dialog.directory ? <FormGroup intent={dialog.validationError ? 'danger' : 'none'} helperText={dialog.validationError} label={t('base:name')}>
        <InputGroup value={dialog.fileName} onChange={(el) => dialog.setFileName(el.currentTarget.value)} />
      </FormGroup> : null}
      <RadioGroup
        label={t('base:select-type')}
        onChange={(element) => dialog.setSelectedTemplate(element.currentTarget .value)}
        selectedValue={dialog.selecedTemplate}
      >
        {dialog.newFileOptions.map((option) => 
          <Radio
            key={option.template}
            value={option.template}
            label={t(`templates:template_${option.name}`)}
          />
        )}
      </RadioGroup>
    </DialogBody>
    <DialogFooter
      actions={<>
        <Button onClick={() => dialog.hide()}>{t('base:cancel')}</Button>
        <Button
          onClick={() => dialog.createFile()}
          intent='primary'
        >
          {t('base:create')}
        </Button>
      </>}
    />
  </Dialog>;
});
