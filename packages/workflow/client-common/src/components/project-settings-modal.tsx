import type React from 'react';
import { Modal, Tabs } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { RunJournalSettingsPanel } from './run-journal-settings-panel.js';
import { RuntimeSettingsPanel } from './runtime-settings-panel.js';

interface Props {
  readonly projectId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

/** The Project menu's "Settings": the project's servers (ADR 0067 (private)) and run journal (ADR 0059 (private)). */
export const ProjectSettingsModal: React.FC<Props> = ({ projectId, open, onClose }) => {
  const t = getGlobalI18n().t;
  return (
    <Modal
      title={t('client:project-settings.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      width={600}
    >
      <div data-testid="project-settings-modal">
        <Tabs
          items={[
            {
              key: 'servers',
              label: <span data-testid="project-settings-tab-servers">{t('client:project-settings.servers')}</span>,
              children: <RuntimeSettingsPanel projectId={projectId} />,
            },
            {
              key: 'run-journal',
              label: (
                <span data-testid="project-settings-tab-run-journal">{t('client:project-settings.run-journal')}</span>
              ),
              children: <RunJournalSettingsPanel projectId={projectId} />,
            },
          ]}
        />
      </div>
    </Modal>
  );
};
