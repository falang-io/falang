import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import Modal from 'antd/es/modal/index.js';
import Button from 'antd/es/button/index.js';
import { message } from 'antd';
import { LogicExportConfigurationPanel } from '@falang/logic-scheme';
import type { DesktopProjectStore } from '../desktop-project-store.js';
import { reportError } from '../../../shared/report-error.js';

interface Props {
  store: DesktopProjectStore;
  open: boolean;
  onClose: () => void;
  /** Runs the actual codegen with the (just-saved) configuration — see `logic-export-runner.ts`. */
  onExport: () => Promise<void>;
}

/**
 * Save/Cancel semantics match the old app's project-settings dialog: the store snapshots itself when
 * the modal opens (`saveConfig`), Cancel/close-by-mask restores that snapshot, Save persists to
 * `<projectDir>/falang/config/logic-export.json`, and Export is "Save, then run".
 */
export const LogicExportConfigurationModal: React.FC<Props> = observer(({ store, open, onClose, onExport }) => {
  useEffect(() => {
    if (open) store.logicExportConfiguration.saveConfig();
  }, [open, store]);

  const cancel = () => {
    store.logicExportConfiguration.restoreOldConfig();
    onClose();
  };

  const save = async (): Promise<boolean> => {
    try {
      await store.saveLogicExportConfiguration();
      return true;
    } catch (error) {
      reportError('Failed to save logic export configuration', error);
      message.error(`Failed to save export configuration: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const saveAndClose = async () => {
    if (await save()) onClose();
  };

  const saveAndExport = async () => {
    if (!(await save())) return;
    onClose();
    await onExport();
  };

  return (
    <Modal
      title="Export Configuration"
      open={open}
      onCancel={cancel}
      footer={[
        <Button key="cancel" onClick={cancel}>
          Cancel
        </Button>,
        <Button
          key="save"
          onClick={() =>
            saveAndClose().catch((error: unknown) => reportError('Failed to save export configuration', error))
          }
        >
          Save
        </Button>,
        <Button
          key="export"
          type="primary"
          onClick={() => saveAndExport().catch((error: unknown) => reportError('Failed to export code', error))}
        >
          Export
        </Button>,
      ]}
    >
      <LogicExportConfigurationPanel store={store.logicExportConfiguration} />
    </Modal>
  );
});
