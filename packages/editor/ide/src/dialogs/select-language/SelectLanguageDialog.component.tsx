import { Button, Dialog, DialogBody, DialogFooter, FormGroup, InputGroup, Radio, RadioGroup } from '@blueprintjs/core'
import { SelectLanguageDialogState } from './SelectLanguageDialogState'
import { observer } from 'mobx-react';

export const SelectLanguageDialogComponent: React.FC<{ dialog: SelectLanguageDialogState }> = observer(({ dialog }) => {
  const t = dialog.dialogs.ide.frontRoot.lang.t;
  return <Dialog 
    isOpen={dialog.isOpen}
    onClose={() => {}}
    style={{width: 300}}
  >
    <DialogBody>
      Пожалуйста, выберите язык<br/>
      Please select language
    </DialogBody>
    <DialogFooter      
      actions={<>
        <Button onClick={() => dialog.selectLanguage('ru')}>Русский</Button>
        <Button onClick={() => dialog.selectLanguage('en')}>English</Button>
      </>}
    />
  </Dialog>;
});
