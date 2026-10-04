import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { AgentChatPanel, ResizeHandle, useResizablePanelWidth } from '@falang/antd';
import { resolveEditorType, TOKEN_INLINE_EDITOR_SERVICE, TOKEN_SCHEME, useService } from '@falang/scheme';
import { useArduinoProjectStore } from '../arduino-project-store-context.js';
import { DebuggerPanel } from './debugger-panel.js';
import { HistoryPanel } from './history-panel.js';
import { appTheme } from '../theme.js';

const styles: Record<string, React.CSSProperties> = {
  iconEditorSidebar: {
    width: 350,
    flexShrink: 0,
    borderLeft: `1px solid ${appTheme.border}`,
    padding: '10px 10px 10px 10px',
    boxSizing: 'border-box',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  rightSidebarRoot: { display: 'flex', flexShrink: 0 },
  rightSidebar: {
    flexShrink: 0,
    padding: '10px 10px 10px 10px',
    boxSizing: 'border-box',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  section: { flexShrink: 0 },
  debugSection: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
};

/** The icon editor for the icon being edited, if it has a `'sidebar'`-type editor — needs the scheme's own container (`useService`). */
const IconEditorSection: React.FC = observer(() => {
  const inlineEditor = useService(TOKEN_INLINE_EDITOR_SERVICE);
  const scheme = useService(TOKEN_SCHEME);
  if (!inlineEditor.editingStore || !inlineEditor.editingId) return null;
  const editingIcon = scheme.icons.getIconSafe(inlineEditor.editingId);
  if (!editingIcon) return null;
  const editorConfig = editingIcon.config.block.editor;
  if (!editorConfig || resolveEditorType(editorConfig, inlineEditor.editingStore) !== 'sidebar') return null;
  const EditorView = editorConfig.view;
  return (
    <div style={styles.section}>
      <EditorView editor={inlineEditor.editingStore} icon={editingIcon} />
    </div>
  );
});

const useHasIconEditor = (): boolean => {
  const inlineEditor = useService(TOKEN_INLINE_EDITOR_SERVICE);
  const scheme = useService(TOKEN_SCHEME);
  if (!inlineEditor.editingStore || !inlineEditor.editingId) return false;
  const editingIcon = scheme.icons.getIconSafe(inlineEditor.editingId);
  const editorConfig = editingIcon?.config.block.editor;
  return Boolean(editorConfig && resolveEditorType(editorConfig, inlineEditor.editingStore) === 'sidebar');
};

/**
 * Inside the tab (ADR 0036 (private) §3) — the *only* thing
 * rendered within the scheme's own `ContainerContext`, next to `SchemeView`. Everything project-level
 * (agent chat, version history, the debugger) moved out to `ProjectRightSidebar` below, which is
 * never unmounted by a tab switch the way this column is.
 */
export const IconEditorColumn: React.FC = observer(() => {
  const hasIconEditor = useHasIconEditor();
  if (!hasIconEditor) return null;
  return (
    <div style={styles.iconEditorSidebar}>
      <IconEditorSection />
    </div>
  );
});

/** `settings:get-agent` once on mount — the app-wide "Settings → Agent…" config (ADR 0026 (private)), unrelated to which document/session is open. No per-run credential/model picker here, unlike the workflow product's own panel (ADR 0031 (private)) — configured just reflects whether Settings has a base URL + model set. */
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
    globalThis.falang.settings
      .getAgentSettings()
      .then((settings) => {
        if (cancelled) return;
        setConfigured(Boolean(settings?.baseUrl && settings.model));
        setModel(settings?.model ?? null);
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
 * The project-level right sidebar (ADR 0036 (private) §3) —
 * a sibling of the tabs column, outside any scheme's `ContainerContext`, so it survives a tab switch
 * and renders the same way over a non-scheme view (the `Devices` editor, the welcome state). Shows
 * exactly one of the agent chat panel or version history, per `store.rightPanel`, with the debug
 * session's own panel stacked below while active (ADR 0021 (private) §3) — hidden entirely when
 * nothing is open.
 */
export const ProjectRightSidebar: React.FC = observer(() => {
  const store = useArduinoProjectStore();
  const agentSettings = useAgentSettings();
  const [width, onResizeStart] = useResizablePanelWidth('falang:panel-width:right-sidebar', 350, {
    min: 260,
    max: 700,
    direction: 'left',
  });
  const hasDebugSession = store.debugSession.status !== 'idle';
  if (store.rightPanel === null && !hasDebugSession) return null;
  return (
    <div style={styles.rightSidebarRoot}>
      <ResizeHandle onPointerDown={onResizeStart} style={{ borderLeft: `1px solid ${appTheme.border}` }} />
      <div style={{ ...styles.rightSidebar, width }}>
        {store.rightPanel === 'agent' && (
          <div style={styles.section}>
            <AgentChatPanel
              store={store.agentChat}
              agentSession={store.agentSession}
              history={store.getActiveHistory()}
              getActiveDocumentId={() => store.getAgentActiveDocumentId()}
              configured={agentSettings.configured}
              configuredLoading={agentSettings.loading}
              model={agentSettings.model}
              onClose={() => store.toggleRightPanel('agent')}
            />
          </div>
        )}
        {store.rightPanel === 'history' && <HistoryPanel />}
        {hasDebugSession && (
          <div style={styles.debugSection}>
            <DebuggerPanel />
          </div>
        )}
      </div>
    </div>
  );
});
