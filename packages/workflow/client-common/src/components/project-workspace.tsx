import type React from 'react';
import { useEffect, useState } from 'react';
import { reaction } from 'mobx';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { message } from 'antd';
import { PrintExportModal, PrintLayer, VersionDiffModal } from '@falang/antd';
import { workflowApi } from '../api-client.js';
import { useClientExtensions } from '../extensions/client-extensions.js';
import { navigationStore } from '../navigation-store.js';
import { WorkflowStore } from '../workflow-store.js';
import { WorkflowStoreContext } from '../workflow-store-context.js';
import { MagicConfirmModal } from './magic-confirm-modal.js';
import { MagicEditorModal } from './magic-editor-modal.js';
import { ProjectRightSidebar } from './project-right-sidebar.js';
import { ServerActivityBar } from './server-activity-bar.js';
import { Toolbar } from './toolbar.js';
import { TasksOnlyWorkspace } from './tasks-only-workspace.js';
import { WorkspaceLayout } from './workspace-layout.js';

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
  //
  // An executor-only member (ADR 0070 (private), `canRead: false`) has no access to the project's contents: no store is
  // built, the workspace shows only the project's Tasks page.
  const [store, setStore] = useState<WorkflowStore | null>(null);
  const aiProviderNames = useClientExtensions().aiProviderName;
  const [tasksOnlyName, setTasksOnlyName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let nextStore: WorkflowStore | null = null;
    setTasksOnlyName(null);
    workflowApi
      .getProject(projectId)
      .catch(() => null)
      .then((info) => {
        if (cancelled) return;
        if (info) navigationStore.setProjectName(projectId, info.name);
        if (info?.canRead === false) {
          setTasksOnlyName(info.name);
          return;
        }
        nextStore = new WorkflowStore(projectId, {
          aiProviderNames,
          owner: info?.owner ?? null,
          readOnly: info?.readOnly === true,
        });
        setStore(nextStore);
      });
    return () => {
      cancelled = true;
      nextStore?.dispose();
    };
    // oxlint-disable-next-line exhaustive-deps -- the host's extensions are fixed for the app's lifetime.
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

  if (tasksOnlyName !== null) return <TasksOnlyWorkspace projectId={projectId} name={tasksOnlyName} />;
  if (!store) return null;

  return (
    <WorkflowStoreContext value={store}>
      <WorkspaceLayout
        store={store}
        header={
          <>
            <Toolbar />
            <ServerActivityBar />
          </>
        }
        rightSidebar={<ProjectRightSidebar />}
      />
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
