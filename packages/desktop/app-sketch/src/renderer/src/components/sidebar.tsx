import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { AgentChatPanel, ResizeHandle, useResizablePanelWidth } from '@falang/antd';
import { resolveEditorType, TOKEN_INLINE_EDITOR_SERVICE, TOKEN_SCHEME, useService } from '@falang/scheme';
import { useDesktopProjectStore } from '../desktop-project-store-context.js';
import { HistoryPanel } from './history-panel.js';
import { appTheme } from '../theme.js';
import { agentSettingsStore } from '../agent-settings-store.js';
import { reportError } from '../../../shared/report-error.js';

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

/** Whether `IconEditorSection` would render anything — mirrors its own guards, so the column can stay hidden when there's nothing to show. */
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
 * (agent chat, version history) moved out to `ProjectRightSidebar` below, which is never unmounted by
 * a tab switch the way this column is.
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

/** Loads the app-wide "Settings → Agent…" config (ADR 0026 (private)) into `agentSettingsStore` once the sidebar mounts; `AgentSettingsModal` updates the store after a save, so the panel never needs a reload to see it. */
const useLoadAgentSettings = (): void => {
  useEffect(() => {
    agentSettingsStore.load().catch((error: unknown) => reportError('Failed to load agent settings', error));
  }, []);
};

/**
 * The project-level right sidebar (ADR 0036 (private) §3) —
 * a sibling of the tabs column, outside any scheme's `ContainerContext`, so it survives a tab switch
 * and renders the same way over a non-scheme view (the welcome state). Shows exactly one of the agent
 * chat panel or version history, per `store.rightPanel`; hidden entirely when neither is open.
 */
export const ProjectRightSidebar: React.FC = observer(() => {
  const store = useDesktopProjectStore();
  useLoadAgentSettings();
  const [width, onResizeStart] = useResizablePanelWidth('falang:panel-width:right-sidebar', 350, {
    min: 260,
    max: 700,
    direction: 'left',
  });
  if (store.rightPanel === null) return null;
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
              configured={agentSettingsStore.configured}
              configuredLoading={agentSettingsStore.loading}
              model={agentSettingsStore.model}
              onClose={() => store.toggleRightPanel('agent')}
            />
          </div>
        )}
        {store.rightPanel === 'history' && <HistoryPanel />}
      </div>
    </div>
  );
});
