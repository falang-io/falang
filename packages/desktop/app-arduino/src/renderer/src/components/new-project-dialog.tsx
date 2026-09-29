import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Input, Modal, Select } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { newProjectDialogStore } from '../new-project-dialog-store.js';
import { ARDUINO_BOARDS } from '../../../shared/board.js';
import { reportError } from '../../../shared/report-error.js';

const fieldStyle: React.CSSProperties = { marginBottom: 4, fontWeight: 500, fontSize: 13 };
const errorStyle: React.CSSProperties = { color: '#ff4d4f', fontSize: 12, marginTop: 4 };

const boardOptions = ARDUINO_BOARDS.map((board) => ({ value: board.fqbn, label: board.label }));

/**
 * "New Project…" dialog — the only entry point for creating a project (replaces the old dialog-free
 * flow that just opened a system folder picker with no board choice at all). Modeled after
 * `@falang/desktop-app-sketch`'s `NewProjectDialog` (name / folder auto-follows the name until
 * hand-edited / "Browse…"), with that dialog's project-type radio group replaced by a board `Select`
 * — the board is chosen once, here, and never changes again, see
 * ADR 0032 (private)'s "Decision → 1". Plain controlled inputs
 * bound to `NewProjectDialogStore` rather than antd's `Form`, same reasoning as the app-sketch
 * original.
 */
export const NewProjectDialog: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = newProjectDialogStore;
  const [touched, setTouched] = useState(false);

  const handleCreate = (): void => {
    setTouched(true);
    store.create().catch((error: unknown) => reportError('Failed to create project', error));
  };

  const nameError = touched && !store.name.trim();
  const directoryError = touched && !store.directory.trim();

  return (
    <Modal
      title={t('desktop-app-arduino:new-project.title')}
      open={store.isOpen}
      onCancel={() => store.close()}
      confirmLoading={store.isCreating}
      onOk={handleCreate}
      okText={t('desktop-app-arduino:new-project.create')}
      cancelText={t('desktop-app-arduino:new-project.cancel')}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={fieldStyle}>{t('desktop-app-arduino:new-project.name-label')}</div>
          <Input
            autoFocus
            value={store.name}
            {...(nameError ? { status: 'error' as const } : {})}
            onChange={(event) => store.setName(event.target.value)}
          />
          {nameError && <div style={errorStyle}>{t('desktop-app-arduino:new-project.name-required')}</div>}
        </div>

        <div>
          <div style={fieldStyle}>{t('desktop-app-arduino:new-project.directory-label')}</div>
          <Input
            value={store.directory}
            {...(directoryError ? { status: 'error' as const } : {})}
            onChange={(event) => store.setDirectory(event.target.value)}
            suffix={
              <Button
                type="text"
                size="small"
                icon={<FolderOpenOutlined />}
                onClick={() =>
                  store.selectDirectory().catch((error: unknown) => reportError('Failed to open folder picker', error))
                }
              />
            }
          />
          {directoryError && <div style={errorStyle}>{t('desktop-app-arduino:new-project.directory-required')}</div>}
        </div>

        <div>
          <div style={fieldStyle}>{t('desktop-app-arduino:new-project.board-label')}</div>
          <Select
            value={store.board}
            onChange={(board) => store.setBoard(board)}
            options={boardOptions}
            style={{ width: '100%' }}
          />
        </div>

        {store.error && <Alert type="error" showIcon message={store.error} />}
      </div>
    </Modal>
  );
});
