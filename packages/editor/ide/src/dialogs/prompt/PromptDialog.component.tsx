import { Button, Dialog, DialogBody, DialogFooter, FormGroup, InputGroup, Radio, RadioGroup } from '@blueprintjs/core'
import { PromptDialogState } from './PromptDialogState'
import { observer } from 'mobx-react';

export const PromptDialogComponent: React.FC<{ dialog: PromptDialogState }> = observer(({ dialog }) => {
  const t = dialog.dialogs.ide.frontRoot.lang.t;
  return <Dialog 
    title={dialog.message}
    isOpen={dialog.isOpen}
    onClose={() => dialog.cancel()}
    style={{width: 300}}
  >
    <DialogBody>
      <FormGroup>
        <InputGroup value={dialog.value} onChange={(el) => dialog.setValue(el.currentTarget.value)} />
      </FormGroup>
    </DialogBody>
    <DialogFooter
      actions={<>
        <Button onClick={() => dialog.cancel()}>{t('base:cancel')}</Button>
        <Button
          onClick={() => dialog.ok()}
          intent='primary'
        >
          {t('base:ok')}
        </Button>
      </>}
    />
  </Dialog>;
});
