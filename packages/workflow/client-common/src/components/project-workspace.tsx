import type React from 'react';
import { useEffect, useState } from 'react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { ContainerContext, getGlobalI18n } from '@falang/scheme';
import { message } from 'antd';
import { PrintExportModal, PrintLayer, ResizeHandle, useResizablePanelWidth, VersionDiffModal } from '@falang/antd';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';
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
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
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
  const [store, setStore] = useState<WorkflowStore | null>(null);
  useEffect(() => {
    const nextStore = new WorkflowStore(projectId);
    setStore(nextStore);
    return () => nextStore.dispose();
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
  const scheme = activeId && !isIntegrationsDoc ? store.getScheme(activeId) : null;

  // The in-tab column (only the icon editor, `Sidebar`) lives inside each variant below, within the
  // scheme's own `ContainerContext` when there is one. The project-level right sidebar (agent chat,
  // version history, run/debug panels) is a sibling of this whole `main` column, rendered once below
  // — a tab switch between these variants (or to no document at all) never unmounts it
  // (ADR 0036 (private) §3).
  const mainContent = (() => {
    if (store.activeView === 'files') {
      return (
        <div style={styles.content}>
          <FilesTab />
        </div>
      );
    }
    if (store.activeView === 'tasks') {
      return (
        <div style={styles.content}>
          <TasksPage projectId={store.projectId} />
        </div>
      );
    }
    if (isIntegrationsDoc) {
      return (
        <div style={styles.content}>
          <IntegrationsEditor />
        </div>
      );
    }
    if (scheme) {
      return (
        <ContainerContext value={scheme.container}>
          <div style={styles.content}>
            {/* `scheme` is only non-null when `activeId` was truthy at the point it was computed above, but TS doesn't carry that narrowing across the two separate `const`s — non-null assertion is safe here. */}
            <SchemeView key={activeId} scheme={scheme} documentId={activeId as string} />
            <Sidebar />
          </div>
        </ContainerContext>
      );
    }
    return (
      <div style={styles.content}>
        <div style={styles.welcome}>
          <div style={styles.welcomeText}>
            {store.isLoadingTree ? 'Loading project…' : 'Create or open a document from the project tree'}
          </div>
        </div>
      </div>
    );
  })();

  return (
    <WorkflowStoreContext value={store}>
      <div style={styles.root}>
        <Toolbar />
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
