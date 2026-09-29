import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Badge, Button, notification } from 'antd';
import { BugOutlined, PlayCircleOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { getGlobalI18n } from '@falang/scheme';
import { getFunctionSignature } from '@falang/workflow-compiler';
import { workflowApi } from '../api-client.js';
import { useWorkflowStore } from '../workflow-store-context.js';
import { ProjectRunsDrawer } from './project-runs-drawer.js';
import { RunFunctionModal } from './run-function-modal.js';

const S: Record<string, React.CSSProperties> = {
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
  runBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    background: '#40a02b',
    border: 'none',
    borderRadius: 4,
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

/** How often the toolbar re-counts this project's open executions for the Runs badge — coarse on purpose, the drawer refreshes itself when opened. */
const RUNNING_COUNT_POLL_MS = 15_000;

/** A function document's declared parameter count, straight from its loaded root — decides whether "Run" needs the arguments form at all. */
const countParameters = (root: Parameters<typeof getFunctionSignature>[0] | undefined): number => {
  if (!root) return 0;
  try {
    return getFunctionSignature(root).parameters.length;
  } catch {
    return 0;
  }
};

/** How many of the project's executions are open right now — refreshed immediately when the watched run's status changes, otherwise a slow poll. */
const useRunningCount = (projectId: string, watchedStatus: string | null): number => {
  const [runningCount, setRunningCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      workflowApi
        .listWorkflowRuns({ projectId })
        .then((runs) => {
          if (!cancelled) setRunningCount(runs.filter((run) => run.status === 'RUNNING').length);
        })
        .catch(() => null);
    };
    refresh();
    const timer = setInterval(refresh, RUNNING_COUNT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [projectId, watchedStatus]);
  return runningCount;
};

/**
 * The toolbar's "Run"/"Debug" buttons and "Runs" drawer button (ADR 0022 (private) and 0021 §5).
 * "Run" runs the active function document on the dev stand — straight away when it takes no
 * arguments, through the arguments form otherwise (or when no function is active, to pick one);
 * `LiveRunStore.startFunction` builds first if needed and terminates whatever else dev was running.
 * "Debug" is the same start flow but through `WorkflowStore.debugFunction`/`DebugSessionStore`,
 * pausing on entry only if no breakpoints are set yet, and disabled while a session is already
 * active (dev is single-pod, one execution at a time). "Runs" opens this project's executions to
 * follow one of them instead.
 */
export const LiveRunControls: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const store = useWorkflowStore();
  const [liveRunOpen, setLiveRunOpen] = useState(false);
  const [debugRunOpen, setDebugRunOpen] = useState(false);
  const [runsOpen, setRunsOpen] = useState(false);
  const runningCount = useRunningCount(store.projectId, store.liveRun.position?.status ?? null);
  const activeDocument = store.activeTabId ? store.getDocument(store.activeTabId) : null;
  const initialFunctionName = activeDocument?.type === 'function' ? activeDocument.name : null;
  const isStarting = store.liveRun.isStarting || store.buildStatus === 'building';
  const isDebugging = store.debugSession.isActive;

  const start = async (functionName: string, args: readonly unknown[]): Promise<boolean> => {
    const started = await store.liveRun.startFunction(functionName, args);
    if (!started && store.liveRun.startError) notification.error({ message: store.liveRun.startError });
    return started;
  };

  // `DebugSessionStore.start` never rejects — a failed `adapter.start()` (a network error, "no dev
  // build to debug", …) is caught internally and surfaces as `lastError`/`status: 'terminated'`
  // instead, the same "check an error field after the awaited call" shape `LiveRunStore.startFunction`
  // already uses for its own `startError`.
  const startDebug = async (functionName: string, args: readonly unknown[]): Promise<boolean> => {
    await store.debugFunction(functionName, args);
    if (store.debugSession.lastError) {
      notification.error({ message: store.debugSession.lastError });
      return false;
    }
    return true;
  };

  const handleRunClick = () => {
    if (activeDocument?.type !== 'function' || countParameters(activeDocument.data) > 0) {
      setLiveRunOpen(true);
      return;
    }
    start(activeDocument.name, []);
  };

  const handleDebugClick = () => {
    if (activeDocument?.type !== 'function' || countParameters(activeDocument.data) > 0) {
      setDebugRunOpen(true);
      return;
    }
    startDebug(activeDocument.name, []);
  };

  return (
    <>
      <Button
        icon={<PlayCircleOutlined />}
        style={S.runBtn}
        loading={isStarting}
        disabled={store.isLoadingDocuments}
        onClick={handleRunClick}
      >
        {isStarting ? t('client:toolbar.run-starting') : t('client:toolbar.run')}
      </Button>
      <Button
        icon={<BugOutlined />}
        style={S.btn}
        loading={store.debugSession.status === 'starting'}
        disabled={store.isLoadingDocuments || isDebugging}
        onClick={handleDebugClick}
      >
        {t('client:toolbar.debug')}
      </Button>
      <Badge count={runningCount} size="small" color="#a6e3a1" offset={[-4, 4]}>
        <Button icon={<UnorderedListOutlined />} style={S.btn} onClick={() => setRunsOpen(true)}>
          {t('client:toolbar.runs')}
        </Button>
      </Badge>
      <RunFunctionModal
        projectId={store.projectId}
        open={liveRunOpen}
        onClose={() => setLiveRunOpen(false)}
        initialFunctionName={initialFunctionName}
        isDevRunning={store.buildStatus === 'running'}
        fixedTarget="dev"
        onStart={start}
      />
      <RunFunctionModal
        projectId={store.projectId}
        open={debugRunOpen}
        onClose={() => setDebugRunOpen(false)}
        initialFunctionName={initialFunctionName}
        isDevRunning={store.buildStatus === 'running'}
        fixedTarget="dev"
        onStart={startDebug}
      />
      <ProjectRunsDrawer open={runsOpen} onClose={() => setRunsOpen(false)} />
    </>
  );
});
