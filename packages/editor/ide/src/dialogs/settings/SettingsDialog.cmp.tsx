import { Button, Dialog, DialogBody, DialogFooter } from "@blueprintjs/core";
import { observer } from "mobx-react";
import { IdeStore } from "../../Ide.store";

export const SettingsDialogComponent: React.FC<{ ide: IdeStore }> = observer(({ ide }) => {
  const t = ide.frontRoot.lang.t;
  const projectStore = ide.projectStore;
  const Component = projectStore?.getSettingsComponent();
  if (!Component || !projectStore) return null;
  return <Dialog
    isOpen={ide.settingsVisible}
    onClose={() => ide.cancelSettings()}
    style={{ width: 500 }}
    canOutsideClickClose={false}
    isCloseButtonShown={false}
    title={t('app:project_settings')}
  >
    <DialogBody>
      <Component project={projectStore} />
    </DialogBody>
    <DialogFooter
      actions={<>
        <Button onClick={() => ide.cancelSettings()}>{t('base:cancel')}</Button>
        <Button onClick={() => ide.saveSettings()}>{t('base:save')}</Button>
      </>}
    />
  </Dialog>;
});
