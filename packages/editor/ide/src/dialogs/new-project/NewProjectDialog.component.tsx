import { Button, Collapse, Dialog, DialogBody, DialogFooter, FormGroup, Icon, InputGroup, Radio, RadioGroup } from '@blueprintjs/core'
import { NewProjectDialogState } from './NewProjectDialogState'
import { observer } from 'mobx-react';
import { runInAction } from 'mobx';

export const NewProjectDialogComponent: React.FC<{ dialog: NewProjectDialogState }> = observer(({ dialog }) => {
  const t = dialog.dialogs.ide.frontRoot.lang.t;
  return <Dialog
    title={t('project:new_project')}
    isOpen={dialog.isOpen}
    onClose={() => dialog.hide()}
    style={{ width: 400 }}
  >
    <DialogBody>
      <FormGroup label={t('base:name')}>
        <InputGroup value={dialog.projectName} onChange={(el) => dialog.setProjectName(el.currentTarget.value)} />
      </FormGroup>
      <FormGroup label={t('base:directory')}>
        <InputGroup
          rightElement={<Button
            icon={"folder-close"}
            minimal={true}
            onClick={() => dialog.selectDirectory()}
          />}
          value={dialog.directory}
          onChange={(el) => dialog.setDirectory(el.currentTarget.value)}
          type={"text"}
        />
      </FormGroup>
      <h4>{t('base:select_type')}</h4>
      <RadioGroup
        label={t('base:base_types')}
        onChange={(element) => dialog.setSelectedType(element.currentTarget.value as any)}
        selectedValue={dialog.selecedType || ''}
      >
        {dialog.projectTypes.filter(type => !type.value.startsWith('console_')).map((type) =>
          <Radio
            key={type.value}
            value={type.value}
            label={type.label}
          />
        )}
      </RadioGroup>
      <RadioGroup
        label={t('base:examples')}
        onChange={(element) => dialog.setSelectedType(element.currentTarget.value as any)}
        selectedValue={dialog.selecedType || ''}
      >
        {dialog.extraTypes.examples.map((type) =>
          <Radio
            key={type.path}
            value={type.path}
            label={type.name}
          />
        )}
      </RadioGroup>
      <RadioGroup
        label={t('base:tests')}
        onChange={(element) => dialog.setSelectedType(element.currentTarget.value as any)}
        selectedValue={dialog.selecedType || ''}
      >
        {dialog.extraTypes.tests.map((type) =>
          <Radio
            key={type.path}
            value={type.path}
            label={type.name}
          />
        )}
      </RadioGroup>
      <FormGroup>
        <Button 
          intent={dialog.showDeprecated ? 'success' : 'none'}
          onClick={() => runInAction(() => dialog.showDeprecated = !dialog.showDeprecated)}
        >{t('base:show-deprecated')}</Button>
      </FormGroup>
      <Collapse isOpen={dialog.showDeprecated}>
        <RadioGroup
          onChange={(element) => dialog.setSelectedType(element.currentTarget.value as any)}
          selectedValue={dialog.selecedType || ''}
        >
          {dialog.projectTypes.filter(type => type.value.startsWith('console_')).map((type) =>
            <Radio
              key={type.value}
              value={type.value}
              label={type.label}
            />
          )}
        </RadioGroup>
      </Collapse>
    </DialogBody>
    <DialogFooter
      actions={<>
        <Button onClick={() => dialog.hide()}>{t('base:cancel')}</Button>
        <Button
          onClick={() => dialog.createProject()}
          intent='primary'
        >
          {t('base:create')}
        </Button>
      </>}
    />
  </Dialog>;
});
