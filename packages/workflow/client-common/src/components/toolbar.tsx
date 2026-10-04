// oxlint-disable max-lines -- grew past 300 lines from ADR 0040 (private)'s "Tasks" toolbar button
// (a small, self-contained addition mirroring the existing "Files" button just above it).
import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Button, Dropdown, notification, Tooltip, type MenuProps } from 'antd';
import { DownOutlined, RobotOutlined, ThunderboltFilled, ThunderboltOutlined } from '@ant-design/icons';
import { getGlobalI18n, type TFunction } from '@falang/scheme';
import { navigationStore } from '../navigation-store.js';
import { useWorkflowStore } from '../workflow-store-context.js';
import { BuildErrorsModal } from './build-errors-modal.js';
import { ProjectMenu } from './project-menu.js';
import { useDevRunActions, type IDevRunActions } from './use-dev-run-actions.js';
import { RunFunctionModal } from './run-function-modal.js';
import { VersionsModal } from './versions-modal.js';
import { SupportButton } from './support-button.js';

const RUNNING_COLOR = '#a6e3a1';
const STOPPED_COLOR = '#f38ba8';

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

/** An on/off toolbar button's "on" look — `S.btn`'s inline background would otherwise hide antd's `primary`. */
const btnActive: React.CSSProperties = { ...S.btn, background: '#89b4fa', color: '#11111b', fontWeight: 600 };

/** "Magic insert" on: a filled, glowing mauve button, so a plain click on a valence point visibly means magic. */
const btnMagicActive: React.CSSProperties = {
  ...S.btn,
  background: 'linear-gradient(135deg, #cba6f7, #f5c2e7)',
  color: '#11111b',
  fontWeight: 600,
  boxShadow: '0 0 0 1px #cba6f7, 0 0 10px rgba(203, 166, 247, 0.65)',
};

interface IDevMenuState {
  readonly devRunning: boolean;
  readonly canBuild: boolean;
  readonly canStop: boolean;
  readonly onToggle: () => void;
  readonly onRestart: () => void;
  readonly onRunDialog: () => void;
}

const buildDevMenuItems = (t: TFunction, state: IDevMenuState, run: IDevRunActions): MenuProps['items'] => [
  {
    key: 'toggle',
    label: state.devRunning ? t('client:toolbar.dev-menu.stop') : t('client:toolbar.dev-menu.start'),
    disabled: state.devRunning ? !state.canStop : !state.canBuild,
    onClick: state.onToggle,
  },
  {
    key: 'restart',
    label: t('client:toolbar.dev-menu.restart'),
    disabled: !state.devRunning || !state.canStop,
    onClick: state.onRestart,
  },
  { type: 'divider' },
  {
    key: 'run-function',
    label: run.isStarting ? t('client:toolbar.run-starting') : t('client:toolbar.run'),
    disabled: run.isStarting || run.isLoadingDocuments,
    onClick: run.onRun,
  },
  {
    key: 'debug',
    label: t('client:toolbar.debug'),
    disabled: run.isLoadingDocuments || run.isDebugging || run.isDebugStarting,
    onClick: run.onDebug,
  },
  {
    key: 'run',
    label: t('client:toolbar.dev-menu.run'),
    disabled: !state.devRunning,
    onClick: state.onRunDialog,
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
  const active = configured && store.magicInsert.enabled;
  return (
    <Tooltip title={t(configured ? 'client:toolbar.magic-insert-tooltip' : 'client:toolbar.magic-insert-disabled')}>
      <Button
        icon={active ? <ThunderboltFilled /> : <ThunderboltOutlined />}
        style={active ? btnMagicActive : S.btn}
        data-testid="toolbar-magic-insert"
        aria-pressed={active}
        disabled={!configured}
        type={active ? 'primary' : 'default'}
        onClick={() => store.magicInsert.setEnabled(!store.magicInsert.enabled)}
      >
        {t('client:toolbar.magic-insert')}
      </Button>
    </Tooltip>
  );
});

/** Toggles the agent chat in the project-level right sidebar. */
const AgentPanelButton: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const active = store.rightPanel === 'agent';
  return (
    <Button
      icon={<RobotOutlined />}
      style={active ? btnActive : S.btn}
      aria-pressed={active}
      type={active ? 'primary' : 'default'}
      onClick={() => store.toggleRightPanel('agent')}
    >
      {t('client:toolbar.agent')}
    </Button>
  );
});

export const Toolbar: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const devRunning = store.buildStatus === 'running';
  const canBuild = !store.isLoadingTree && store.buildStatus !== 'building' && store.buildStatus !== 'stopping';
  const canStop = store.buildStatus === 'running';
  const canPublish = !store.isLoadingTree && !store.isPublishing;
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [buildErrorsOpen, setBuildErrorsOpen] = useState(false);
  const activeDocument = store.activeTabId ? store.getDocument(store.activeTabId) : null;
  const initialFunctionName = activeDocument?.type === 'function' ? activeDocument.name : null;
  const devRun = useDevRunActions();

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
    {
      devRunning,
      canBuild,
      canStop,
      onToggle: () => (devRunning ? store.stopProject() : store.buildProject()),
      onRestart: () => store.restartProject(),
      onRunDialog: () => setRunOpen(true),
    },
    devRun,
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
      <ProjectMenu buttonStyle={S.btn} errorStyle={S.error} />
      <SupportButton type="default" style={S.btn} />
      <AgentPanelButton />
      <MagicInsertButton />
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
      {devRun.modals}
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
