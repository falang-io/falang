import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Input, Modal, Radio } from 'antd';
import { FolderOpenOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { newProjectDialogStore } from '../new-project-dialog-store.js';
import { PROJECT_TYPE_ORDER } from '../../../shared/project-types.js';
import { reportError } from '../../../shared/report-error.js';

const fieldStyle: React.CSSProperties = { marginBottom: 4, fontWeight: 500, fontSize: 13 };
const errorStyle: React.CSSProperties = { color: '#ff4d4f', fontSize: 12, marginTop: 4 };

/**
 * "New Project…" dialog — the only entry point for creating a project (replaces the old dialog-free
 * flow that just opened a system folder picker and always wrote `type: 'text'`). Modeled after the
 * old app's own `NewProjectDialogComponent`/`NewProjectDialogState`: name, folder (auto-follows the
 * name until hand-edited, "Browse…" opens a system picker seeded with the current value), and a
 * project type radio group — see ADR 0005 (private)'s "Implementation notes (project types,
 * new-project dialog, single default document — 2026-09-20)". Plain controlled inputs bound to
 * `NewProjectDialogStore` rather than antd's `Form`, since the directory-follows-name behavior is
 * easier to express as a MobX action than to reconcile with `Form`'s own field state.
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
      title={t('desktop-app-sketch:new-project.title')}
      open={store.isOpen}
      onCancel={() => store.close()}
      confirmLoading={store.isCreating}
      onOk={handleCreate}
      okText={t('desktop-app-sketch:new-project.create')}
      cancelText={t('desktop-app-sketch:new-project.cancel')}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <div style={fieldStyle}>{t('desktop-app-sketch:new-project.name-label')}</div>
          <Input
            autoFocus
            value={store.name}
            {...(nameError ? { status: 'error' as const } : {})}
            onChange={(event) => store.setName(event.target.value)}
          />
          {nameError && <div style={errorStyle}>{t('desktop-app-sketch:new-project.name-required')}</div>}
        </div>

        <div>
          <div style={fieldStyle}>{t('desktop-app-sketch:new-project.directory-label')}</div>
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
          {directoryError && <div style={errorStyle}>{t('desktop-app-sketch:new-project.directory-required')}</div>}
        </div>

        <div>
          <div style={fieldStyle}>{t('desktop-app-sketch:new-project.type-label')}</div>
          <Radio.Group
            value={store.type}
            onChange={(event) => store.setType(event.target.value)}
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {PROJECT_TYPE_ORDER.map((type) => (
              <Radio key={type} value={type}>
                {t(`desktop-app-sketch:new-project.type.${type}`)}
              </Radio>
            ))}
          </Radio.Group>
        </div>

        {store.error && <Alert type="error" showIcon message={store.error} />}
      </div>
    </Modal>
  );
});
