import type React from 'react';
import { useEffect, useState } from 'react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { ContainerContext, getGlobalI18n } from '@falang/scheme';
import { message } from 'antd';
import { PrintExportModal, PrintLayer, ResizeHandle, useResizablePanelWidth, VersionDiffModal } from '@falang/antd';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';
import { workflowApi } from '../api-client.js';
import { navigationStore } from '../navigation-store.js';
import { WorkflowStore } from '../workflow-store.js';
import { WorkflowStoreContext } from '../workflow-store-context.js';
import { ProjectTree } from './project-tree.js';
import { TabsBar } from './tabs-bar.js';
import { SchemeView } from './scheme-view.js';
import { FilesTab } from './files-tab.js';
import { IntegrationsEditor } from './integrations-editor.js';
import { MagicConfirmModal } from './magic-confirm-modal.js';
import { MagicEditorModal } from './magic-editor-modal.js';
import { ProjectRightSidebar } from './project-right-sidebar.js';
import { Sidebar } from './sidebar.js';
import { TasksPage } from './tasks-page.js';
import { ServerActivityBar } from './server-activity-bar.js';
import { Toolbar } from './toolbar.js';

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

interface Props {
  projectId: string;
}

export const ProjectWorkspace: React.FC<Props> = observer(({ projectId }) => {
  // Created *inside* the effect, not `useMemo`, so construction and disposal are properly paired
  // in the same place — under React StrictMode's dev-only mount→cleanup→mount double-invoke, a
  // `useMemo`-created store survives that cycle unchanged (memoized values aren't recreated by it)
  // while an effect *cleanup* still fires on the fake unmount — disposing the one-and-only store
  // (unsubscribing `DebugSessionStore`/`LiveRunStore` from their adapters for good) while the app
  // keeps using that same now-broken instance for the rest of its life. Found live: a debug/run
  // session's backend polling kept working, but the UI never reflected any of it, because its
  // `DebugSessionStore` had been silently unsubscribed moments after mount. Pairing create/dispose
  // in the same effect makes the double-invoke symmetric: StrictMode's extra cleanup+re-run creates
  // a fresh store the second time around, exactly as intended.
  //
  // `GET /projects/:id` first: an admin opening someone else's project gets `readOnly: true`, which the store
  // needs at construction (its schemes are built read-only). A failed lookup opens the project as before — the
  // tree load then reports the error the usual way.
  const [store, setStore] = useState<WorkflowStore | null>(null);
  useEffect(() => {
    let cancelled = false;
    let nextStore: WorkflowStore | null = null;
    workflowApi
      .getProject(projectId)
      .catch(() => null)
      .then((info) => {
        if (cancelled) return;
        if (info) navigationStore.setProjectName(projectId, info.name);
        nextStore = new WorkflowStore(projectId, { readOnly: info?.readOnly === true, owner: info?.owner ?? null });
        setStore(nextStore);
      });
    return () => {
      cancelled = true;
      nextStore?.dispose();
    };
  }, [projectId]);

  // A `PATCH`/`DELETE` 409'd on a document the 5s lock poll hadn't caught up with yet — the overlay
  // (`SchemeView`) already reflects the lock as soon as `markLockedFromConflict` runs; this is just
  // the one-off toast on top of it, per ADR 0029 (private)'s "show an antd
  // message and mark the document locked until the next poll." A plain subscribe/unsubscribe pair
  // scoped to this effect, not a disposable resource — the `useMemo`/dispose StrictMode mismatch
  // documented elsewhere in this component doesn't apply here.
  useEffect(() => {
    if (!store) return;
    return reaction(
      () => store.documentLocksStore.lastConflict,
      (conflict) => {
        if (!conflict) return;
        const t = getGlobalI18n().t;
        const name = store.getDocument(conflict.documentId)?.name ?? conflict.documentId;
        message.warning(t('client:project-workspace.document-locked-conflict', { name }));
      },
    );
  }, [store]);

  const [treeWidth, onTreeResizeStart] = useResizablePanelWidth('falang:panel-width:project-tree', 220, {
    min: 160,
    max: 480,
    direction: 'right',
  });

  if (!store) return null;

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
  // run/debug panels) is a sibling of this whole `main` column, rendered once below — a tab switch
  // between these variants (or to no document at all) never unmounts it (ADR 0036 (private) §3).
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

  const mainContent = (
    <div style={styles.stage}>
      {mountedSchemeIds.map((id) => {
        const active = showScheme && id === activeSchemeId;
        return (
          <ContainerContext key={id} value={store.getScheme(id).container}>
            <div
              style={{ ...styles.schemeLayer, ...(active ? styles.schemeLayerActive : styles.schemeLayerHidden) }}
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
  );

  return (
    <WorkflowStoreContext value={store}>
      <div style={styles.root}>
        <Toolbar />
        <ServerActivityBar />
        <div style={styles.body}>
          <div style={{ ...styles.projectTree, width: treeWidth }}>
            <ProjectTree />
          </div>
          <ResizeHandle onPointerDown={onTreeResizeStart} style={{ borderRight: '1px solid #313244' }} />

          <div style={styles.main}>
            <TabsBar />
            {mainContent}
          </div>

          <ProjectRightSidebar />
        </div>
      </div>
      <MagicEditorModal />
      <MagicConfirmModal />
      <VersionDiffModal
        open={store.diffModalOpen}
        store={store.versionHistory}
        buildReadOnlyScheme={store.buildReadOnlySchemeForDiff}
        onClose={() => store.closeDiffModal()}
      />
      {store.printExport && (
        <>
          <PrintExportModal
            store={store.printExport}
            open={store.printExport.stage === 'select'}
            onClose={() => {
              if (store.printExport?.stage === 'select') store.closePrintExport();
            }}
          />
          <PrintLayer store={store.printExport} onClose={() => store.closePrintExport()} />
        </>
      )}
    </WorkflowStoreContext>
  );
});
