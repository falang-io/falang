import type React from 'react';
import { observer } from 'mobx-react-lite';
import { ContainerContext } from '@falang/scheme';
import { ResizeHandle, useResizablePanelWidth } from '@falang/antd';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';
import type { WorkflowStore } from '../workflow-store.js';
import { WorkflowStoreContext } from '../workflow-store-context.js';
import { ProjectTree } from './project-tree.js';
import { TabsBar } from './tabs-bar.js';
import { SchemeView } from './scheme-view.js';
import { FilesTab } from './files-tab.js';
import { IntegrationsEditor } from './integrations-editor.js';
import { Sidebar } from './sidebar.js';
import { TasksPage } from './tasks-page.js';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: '#1e1e2e',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  projectTree: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    minWidth: 0,
  },
  /** Holds every mounted scheme layer plus the non-scheme views, stacked. */
  stage: {
    flex: 1,
    position: 'relative' as const,
    minHeight: 0,
    overflow: 'hidden',
  },
  schemeLayer: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    overflow: 'hidden',
  },
  schemeLayerActive: {
    visibility: 'visible' as const,
    zIndex: 1,
  },
  // `visibility: hidden` (not `display: none`) on purpose: a kept-alive canvas keeps its real size, so
  // blocks that are re-measured while it is hidden (an agent editing a background document) get real
  // heights, and `scrollToNode`/`focusNode` still find a laid-out root div to pan. Hidden elements take
  // no pointer events and cannot be focused.
  schemeLayerHidden: {
    visibility: 'hidden' as const,
    pointerEvents: 'none' as const,
    zIndex: 0,
  },
  otherLayer: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    overflow: 'hidden',
    zIndex: 2,
    background: '#1e1e2e',
  },
  welcome: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    color: '#6c7086',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
  },
};

interface IWorkspaceLayoutProps {
  readonly store: WorkflowStore;
  /** The bar above everything — the project `Toolbar`, or the guest's sign-in bar. */
  readonly header: React.ReactNode;
  /** Right of the tabs column, outside any scheme's container (the project-level sidebar). */
  readonly rightSidebar?: React.ReactNode;
}

/**
 * The editor of one open project: project tree, tabs and the stage with the kept-alive scheme layers, between a
 * header and an optional right sidebar. Shared by `ProjectWorkspace` and the guest's `GuestTemplateWorkspace`;
 * provides `WorkflowStoreContext` to everything inside, header included.
 */
export const WorkspaceLayout: React.FC<IWorkspaceLayoutProps> = observer(({ store, header, rightSidebar }) => {
  const [treeWidth, onTreeResizeStart] = useResizablePanelWidth('falang:panel-width:project-tree', 220, {
    min: 160,
    max: 480,
    direction: 'right',
  });

  const activeId = store.activeTabId;
  const activeDocument = activeId ? store.getDocument(activeId) : null;
  const isIntegrationsDoc = activeDocument?.type === INTEGRATIONS_DOCUMENT_TYPE;
  // The scheme tabs kept mounted (the active one plus the most recently active others, hidden — see
  // `keep-alive.ts`). The active scheme is always among them even on the very first render, before the
  // store's keep-alive reaction has run.
  const activeSchemeId = store.activeSchemeDocumentId;
  const mountedSchemeIds = store.keepAliveSchemeIds.filter(
    (id) => store.getDocument(id) && store.openTabIds.includes(id),
  );
  if (activeSchemeId && !mountedSchemeIds.includes(activeSchemeId)) mountedSchemeIds.push(activeSchemeId);
  const showScheme = store.activeView === null && activeSchemeId !== null;

  // The in-tab column (only the icon editor, `Sidebar`) lives inside each scheme's own layer, within
  // that scheme's `ContainerContext`. The project-level right sidebar (agent chat, version history,
  // run/debug panels) is a sibling of this whole `main` column — a tab switch between these variants
  // (or to no document at all) never unmounts it (ADR 0036 (private) §3).
  const otherContent = (() => {
    if (store.activeView === 'files') return <FilesTab />;
    if (store.activeView === 'tasks') return <TasksPage projectId={store.projectId} />;
    if (isIntegrationsDoc) return <IntegrationsEditor />;
    if (showScheme) return null;
    return (
      <div style={styles.welcome}>
        <div style={styles.welcomeText}>
          {store.isLoadingTree ? 'Loading project…' : 'Create or open a document from the project tree'}
        </div>
      </div>
    );
  })();

  return (
    <WorkflowStoreContext value={store}>
      <div style={styles.root}>
        {header}
        <div style={styles.body}>
          <div style={{ ...styles.projectTree, width: treeWidth }}>
            <ProjectTree />
          </div>
          <ResizeHandle onPointerDown={onTreeResizeStart} style={{ borderRight: '1px solid #313244' }} />

          <div style={styles.main}>
            <TabsBar />
            <div style={styles.stage}>
              {mountedSchemeIds.map((id) => {
                const active = showScheme && id === activeSchemeId;
                return (
                  <ContainerContext key={id} value={store.getScheme(id).container}>
                    <div
                      style={{
                        ...styles.schemeLayer,
                        ...(active ? styles.schemeLayerActive : styles.schemeLayerHidden),
                      }}
                      aria-hidden={!active}
                    >
                      <SchemeView scheme={store.getScheme(id)} documentId={id} active={active} />
                      <Sidebar />
                    </div>
                  </ContainerContext>
                );
              })}
              {otherContent && <div style={styles.otherLayer}>{otherContent}</div>}
            </div>
          </div>

          {rightSidebar}
        </div>
      </div>
    </WorkflowStoreContext>
  );
});
