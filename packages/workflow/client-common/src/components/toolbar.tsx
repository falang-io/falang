// oxlint-disable max-lines -- grew past 300 lines from ADR 0040 (private)'s "Tasks" toolbar button
// (a small, self-contained addition mirroring the existing "Files" button just above it).
import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Badge, Button, Dropdown, notification, Tooltip, type MenuProps } from 'antd';
import {
  CarryOutOutlined,
  CodeOutlined,
  DownOutlined,
  FolderOutlined,
  HistoryOutlined,
  RobotOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import { navigationStore } from '../navigation-store.js';
import { useWorkflowStore } from '../workflow-store-context.js';
import { ExportButtons } from './export-buttons.cmp.js';
import { BuildErrorsModal } from './build-errors-modal.js';
import { CodeViewerModal } from './code-viewer-modal.js';
import { LiveRunControls } from './live-run-controls.js';
import { RunFunctionModal } from './run-function-modal.js';
import { VersionsModal } from './versions-modal.js';
import { SupportButton } from './support-button.js';

const RUNNING_COLOR = '#a6e3a1';
const STOPPED_COLOR = '#f38ba8';

/** Kept as its own tiny function (not an inline ternary in `Toolbar` itself) purely to stay under
 *  oxlint's `complexity` cap — `Toolbar` was already at the limit before the "Files" button below. */
const toggleButtonType = (active: boolean): 'primary' | 'default' => (active ? 'primary' : 'default');

const S: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 12px',
    borderBottom: '1px solid #313244',
    background: '#181825',
    color: '#cdd6f4',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 12,
    flexShrink: 0,
  },
  projectName: { fontWeight: 600 },
  spacer: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  dropdownIcon: { fontSize: 10, opacity: 0.7 },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    background: '#313244',
    border: 'none',
    borderRadius: 4,
    color: '#cdd6f4',
    fontSize: 12,
    cursor: 'pointer',
  },
  error: { color: '#f38ba8' },
};

const buildDevMenuItems = (
  t: TFunction,
  devRunning: boolean,
  canBuild: boolean,
  canStop: boolean,
  onToggle: () => void,
  onRun: () => void,
): MenuProps['items'] => [
  {
    key: 'toggle',
    label: devRunning ? t('client:toolbar.dev-menu.stop') : t('client:toolbar.dev-menu.start'),
    disabled: devRunning ? !canStop : !canBuild,
    onClick: onToggle,
  },
  {
    key: 'run',
    label: t('client:toolbar.dev-menu.run'),
    disabled: !devRunning,
    onClick: onRun,
  },
];

const buildProdMenuItems = (
  t: TFunction,
  prodRunning: boolean,
  prodToggleDisabled: boolean,
  isPublishing: boolean,
  canPublish: boolean,
  onToggle: () => void,
  onPublish: () => void,
  onVersions: () => void,
): MenuProps['items'] => [
  {
    key: 'toggle',
    label: prodRunning ? t('client:toolbar.prod-menu.stop') : t('client:toolbar.prod-menu.start'),
    disabled: prodToggleDisabled,
    onClick: onToggle,
  },
  {
    key: 'publish',
    label: isPublishing ? t('client:toolbar.publishing') : t('client:toolbar.prod-menu.publish'),
    disabled: !canPublish,
    onClick: onPublish,
  },
  {
    key: 'versions',
    label: t('client:toolbar.versions'),
    onClick: onVersions,
  },
];

/** The per-user "Magic insert" toggle (ADR 0046 (private)); disabled until an admin configured the agent. */
const MagicInsertButton: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const configured = store.agentSettings.configured;
  return (
    <Tooltip title={t(configured ? 'client:toolbar.magic-insert-tooltip' : 'client:toolbar.magic-insert-disabled')}>
      <Button
        icon={<ThunderboltOutlined />}
        style={S.btn}
        data-testid="toolbar-magic-insert"
        disabled={!configured}
        type={toggleButtonType(configured && store.magicInsert.enabled)}
        onClick={() => store.magicInsert.setEnabled(!store.magicInsert.enabled)}
      >
        {t('client:toolbar.magic-insert')}
      </Button>
    </Tooltip>
  );
});

export const Toolbar: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const devRunning = store.buildStatus === 'running';
  const canBuild = !store.isLoadingTree && store.buildStatus !== 'building';
  const canStop = store.buildStatus === 'running';
  const canPublish = !store.isLoadingTree && !store.isPublishing;
  const [codeViewerOpen, setCodeViewerOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [buildErrorsOpen, setBuildErrorsOpen] = useState(false);
  const activeDocument = store.activeTabId ? store.getDocument(store.activeTabId) : null;
  const initialFunctionName = activeDocument?.type === 'function' ? activeDocument.name : null;

  // Surfaces a failed test-stand build (project doesn't compile) the moment its error list lands,
  // rather than requiring the user to notice and click a summary line first.
  useEffect(() => {
    if (store.buildErrors.length > 0) setBuildErrorsOpen(true);
  }, [store.buildErrors]);

  const handleProdToggle = async () => {
    const wasRunning = store.prodRunning;
    await (wasRunning ? store.stopProdRunner() : store.startProdRunner());
    if (store.connectionError) {
      notification.error({ message: store.connectionError });
    } else {
      notification.success({
        message: wasRunning ? t('client:toolbar.prod-menu.stop-success') : t('client:toolbar.prod-menu.start-success'),
      });
    }
  };

  const handlePublish = async () => {
    await store.publishProject();
    if (store.connectionError) {
      notification.error({ message: store.connectionError });
    } else {
      notification.success({ message: t('client:toolbar.prod-menu.publish-success') });
    }
  };

  const devMenuItems = buildDevMenuItems(
    t,
    devRunning,
    canBuild,
    canStop,
    () => (devRunning ? store.stopProject() : store.buildProject()),
    () => setRunOpen(true),
  );

  const prodMenuItems = buildProdMenuItems(
    t,
    store.prodRunning,
    store.isProdActionLoading || (!store.prodRunning && !store.hasVersions),
    store.isPublishing,
    canPublish,
    handleProdToggle,
    handlePublish,
    () => setVersionsOpen(true),
  );

  return (
    <div style={S.root}>
      <Button style={S.btn} onClick={() => navigationStore.goToProjectList()}>
        {t('client:toolbar.back')}
      </Button>
      <span style={S.projectName}>{navigationStore.selectedProjectName}</span>
      <span style={S.spacer} />
      {store.connectionError && <span style={S.error}>{store.connectionError}</span>}
      {store.buildErrors.length > 0 && (
        <span
          style={{ ...S.error, cursor: 'pointer', textDecoration: 'underline' }}
          onClick={() => setBuildErrorsOpen(true)}
        >
          {t('client:toolbar.compile-errors', { count: store.buildErrors.length })}
        </span>
      )}
      {store.lastBuildResult && (
        <span>{t('client:toolbar.task-queue', { taskQueue: store.lastBuildResult.taskQueue })}</span>
      )}
      {store.lastBuildResult && store.lastBuildResult.terminatedExecutionsCount > 0 && (
        <span style={S.error}>
          {t('client:toolbar.terminated-executions', { count: store.lastBuildResult.terminatedExecutionsCount })}
        </span>
      )}
      {store.lastPublishedVersion && (
        <span>{t('client:toolbar.published-version', { version: store.lastPublishedVersion.versionNumber })}</span>
      )}
      <Button icon={<CodeOutlined />} style={S.btn} onClick={() => setCodeViewerOpen(true)}>
        {t('client:toolbar.view-code')}
      </Button>
      <Button
        icon={<FolderOutlined />}
        style={S.btn}
        type={toggleButtonType(store.activeView === 'files')}
        onClick={() => store.toggleFilesView()}
      >
        {t('client:toolbar.files')}
      </Button>
      <Badge count={store.tasks.openCount} size="small" offset={[-4, 4]}>
        <Button
          icon={<CarryOutOutlined />}
          style={S.btn}
          type={toggleButtonType(store.activeView === 'tasks')}
          onClick={() => store.toggleTasksView()}
        >
          {t('client:toolbar.tasks')}
        </Button>
      </Badge>
      <SupportButton type="default" style={S.btn} />
      <Button
        icon={<RobotOutlined />}
        style={S.btn}
        type={store.rightPanel === 'agent' ? 'primary' : 'default'}
        onClick={() => store.toggleRightPanel('agent')}
      >
        {t('client:toolbar.agent')}
      </Button>
      <MagicInsertButton />
      <Button
        icon={<HistoryOutlined />}
        style={S.btn}
        type={store.rightPanel === 'history' ? 'primary' : 'default'}
        onClick={() => store.toggleRightPanel('history')}
      >
        {t('client:toolbar.history')}
      </Button>
      <ExportButtons buttonStyle={S.btn} errorStyle={S.error} />
      <LiveRunControls />
      <Dropdown menu={{ items: devMenuItems }} trigger={['click']}>
        <Button style={S.btn}>
          <span style={{ ...S.dot, background: devRunning ? RUNNING_COLOR : STOPPED_COLOR }} />
          {t('client:toolbar.dev-menu.label')}
          <DownOutlined style={S.dropdownIcon} />
        </Button>
      </Dropdown>
      <Dropdown menu={{ items: prodMenuItems }} trigger={['click']}>
        <Button style={S.btn}>
          <span style={{ ...S.dot, background: store.prodRunning ? RUNNING_COLOR : STOPPED_COLOR }} />
          {t('client:toolbar.prod-menu.label')}
          <DownOutlined style={S.dropdownIcon} />
        </Button>
      </Dropdown>
      <CodeViewerModal projectId={store.projectId} open={codeViewerOpen} onClose={() => setCodeViewerOpen(false)} />
      <VersionsModal projectId={store.projectId} open={versionsOpen} onClose={() => setVersionsOpen(false)} />
      <BuildErrorsModal
        open={buildErrorsOpen}
        errors={store.buildErrors}
        files={store.buildFiles}
        onClose={() => setBuildErrorsOpen(false)}
      />
      <RunFunctionModal
        projectId={store.projectId}
        open={runOpen}
        onClose={() => setRunOpen(false)}
        initialFunctionName={initialFunctionName}
        isDevRunning={devRunning}
        fixedTarget="dev"
      />
    </div>
  );
});
