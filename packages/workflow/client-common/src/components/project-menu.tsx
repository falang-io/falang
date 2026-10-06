import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Badge, Button, Dropdown, type MenuProps } from 'antd';
import {
  CarryOutOutlined,
  CheckOutlined,
  CodeOutlined,
  DownOutlined,
  ExportOutlined,
  FilePdfOutlined,
  FolderOutlined,
  HistoryOutlined,
  ProfileOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { useWorkflowStore } from '../workflow-store-context.js';
import { useProjectExport } from './export-buttons.cmp.js';
import { CodeViewerModal } from './code-viewer-modal.js';
import { RunJournalSettingsModal } from './run-journal-settings-modal.js';
import { ProjectRunsDrawer } from './project-runs-drawer.js';
import { useRunningCount } from './use-running-count.js';

export interface IProjectMenuProps {
  readonly buttonStyle: React.CSSProperties;
  readonly errorStyle: React.CSSProperties;
}

const ACTIVE_MARK = <CheckOutlined style={{ color: '#a6e3a1' }} />;

/** A menu item's trailing decoration: a check for an active view/panel, or an open-count badge. */
const withMark = (label: string, active: boolean, count = 0): React.ReactNode =>
  active || count > 0 ? (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
      {label}
      {active && ACTIVE_MARK}
      {count > 0 && <Badge count={count} size="small" color="#a6e3a1" />}
    </span>
  ) : (
    label
  );

/** The toolbar's "Project" menu: code, files, tasks, history, JSON/PDF export and the runs drawer. */
export const ProjectMenu: React.FC<IProjectMenuProps> = observer(({ buttonStyle, errorStyle }) => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const projectExport = useProjectExport();
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const [journalSettingsOpen, setJournalSettingsOpen] = useState(false);
  const runningCount = useRunningCount(store.projectId, store.liveRun.position?.status ?? null);

  const items: MenuProps['items'] = [
    {
      key: 'code',
      icon: <CodeOutlined />,
      label: t('client:toolbar.view-code'),
      onClick: () => setCodeViewerOpen(true),
    },
    {
      key: 'files',
      icon: <FolderOutlined />,
      label: withMark(t('client:toolbar.files'), store.activeView === 'files'),
      onClick: () => store.toggleFilesView(),
    },
    {
      key: 'tasks',
      icon: <CarryOutOutlined />,
      label: withMark(t('client:toolbar.tasks'), store.activeView === 'tasks', store.tasks.openCount),
      onClick: () => store.toggleTasksView(),
    },
    {
      key: 'history',
      icon: <HistoryOutlined />,
      label: withMark(t('client:toolbar.history'), store.rightPanel === 'history'),
      onClick: () => store.toggleRightPanel('history'),
    },
    {
      key: 'runs',
      icon: <UnorderedListOutlined />,
      label: withMark(t('client:toolbar.runs'), false, runningCount),
      onClick: () => setRunsOpen(true),
    },
    {
      key: 'run-journal-settings',
      icon: <ProfileOutlined />,
      label: t('client:toolbar.run-journal'),
      onClick: () => setJournalSettingsOpen(true),
    },
    { type: 'divider' },
    {
      key: 'export-json',
      icon: <ExportOutlined />,
      label: projectExport.isExporting ? t('client:toolbar.exporting') : t('client:toolbar.export'),
      disabled: projectExport.isExporting,
      onClick: () => {
        projectExport.exportJson();
      },
    },
    {
      key: 'export-pdf',
      icon: <FilePdfOutlined />,
      label: t('client:toolbar.export-pdf'),
      onClick: projectExport.openPdf,
    },
  ];

  // The button itself shows a badge when anything inside needs attention (open tasks / running runs).
  const attention = store.tasks.openCount + runningCount;

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']}>
        <Button style={buttonStyle} data-testid="toolbar-project-menu">
          <Badge dot={attention > 0} color="#a6e3a1" offset={[4, -2]}>
            <span style={{ color: '#cdd6f4' }}>{t('client:toolbar.project-menu')}</span>
          </Badge>
          <DownOutlined style={{ fontSize: 10, opacity: 0.7 }} />
        </Button>
      </Dropdown>
      {projectExport.exportError && <span style={errorStyle}>{projectExport.exportError}</span>}
      <CodeViewerModal projectId={store.projectId} open={codeViewerOpen} onClose={() => setCodeViewerOpen(false)} />
      <RunJournalSettingsModal
        projectId={store.projectId}
        open={journalSettingsOpen}
        onClose={() => setJournalSettingsOpen(false)}
      />
      <ProjectRunsDrawer open={runsOpen} onClose={() => setRunsOpen(false)} />
    </>
  );
});
