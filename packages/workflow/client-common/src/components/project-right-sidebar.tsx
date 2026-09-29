import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AgentChatPanel, ResizeHandle, useResizablePanelWidth } from '@falang/antd';
import { workflowApi } from '../api-client.js';
import { useClientExtensions } from '../extensions/client-extensions.js';
import { useWorkflowStore } from '../workflow-store-context.js';
import { DebuggerPanel } from './debugger-panel.js';
import { HistoryPanel } from './history-panel.js';
import { RunPanel } from './run-panel.js';

const styles: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexShrink: 0 },
  sidebar: {
    flexShrink: 0,
    padding: '10px 10px 10px 10px',
    boxSizing: 'border-box',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  section: { flexShrink: 0 },
  runSection: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
};

/** `GET /agent/settings` once for the lifetime of the project workspace — the app-wide admin config
 *  status (ADR 0031 (private)), unrelated to which document/session is open. Lives here rather than
 *  in the old per-tab `Sidebar` so it's fetched once per project, not refetched on every tab switch
 *  (ADR 0036 (private)). */
const useAgentSettings = (): {
  readonly configured: boolean;
  readonly loading: boolean;
  readonly model: string | null;
} => {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    workflowApi
      .getAgentSettings()
      .then((status) => {
        if (cancelled) return;
        setConfigured(status.configured);
        setModel(status.model);
      })
      .catch(() => {
        if (cancelled) return;
        setConfigured(false);
        setModel(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { configured, loading, model };
};

/**
 * The project-level right sidebar (ADR 0036 (private) §3) — a sibling of the tabs+content column,
 * outside any scheme's `ContainerContext`, so a tab switch (or switching to a non-scheme view like
 * the integrations editor, or having no document open at all) never unmounts it — this is the fix for
 * that ADR's problem 1/2 ("the chat resets on tab switch"/"the agent gets confused"): the same
 * `AgentChatPanel`, over the same project-wide `store.agentSession`, stays mounted regardless of what
 * the rest of the workspace is showing.
 *
 * Shows exactly one of the Agent chat panel or the version history panel, chosen by
 * `store.rightPanel`, plus — stacked below, automatically while active — the run panel and/or
 * debugger panel (both project-level too, see ADR 0021 (private) §3 and 0022). Hidden entirely when
 * none of the above has anything to show. Replaces the old `Sidebar`'s agent/history/run/debug
 * sections and the `RunSidebar` fallback (deleted — this one column now covers every view).
 */
export const ProjectRightSidebar: React.FC = observer(() => {
  const store = useWorkflowStore();
  const extensions = useClientExtensions();
  const hasRun = store.liveRun.watchedRun !== null;
  const hasDebugSession = store.debugSession.status !== 'idle';
  const agentSettings = useAgentSettings();
  const [width, onResizeStart] = useResizablePanelWidth('falang:panel-width:right-sidebar', 350, {
    min: 260,
    max: 700,
    direction: 'left',
  });
  const showAgent = store.rightPanel === 'agent';
  const showHistory = store.rightPanel === 'history';
  if (!showAgent && !showHistory && !hasRun && !hasDebugSession) return null;
  return (
    <div style={styles.root}>
      <ResizeHandle onPointerDown={onResizeStart} style={{ borderLeft: '1px solid #313244' }} />
      <div style={{ ...styles.sidebar, width }}>
        {showAgent && (
          <div style={styles.section}>
            <AgentChatPanel
              store={store.agentChat}
              agentSession={store.agentSession}
              history={store.getActiveHistory()}
              getActiveDocumentId={() => store.getAgentActiveDocumentId()}
              configured={agentSettings.configured}
              configuredLoading={agentSettings.loading}
              model={agentSettings.model}
              renderError={extensions.renderAgentQuotaNotice}
            />
          </div>
        )}
        {showHistory && <HistoryPanel />}
        {hasDebugSession && (
          <div style={styles.runSection}>
            <DebuggerPanel />
          </div>
        )}
        {hasRun && (
          <div style={styles.runSection}>
            <RunPanel />
          </div>
        )}
      </div>
    </div>
  );
});
