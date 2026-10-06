import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ContainerContext } from '@falang/scheme';
import { PrintExportModal, PrintLayer, ResizeHandle, useResizablePanelWidth, VersionDiffModal } from '@falang/antd';
import { DesktopProjectStore } from '../desktop-project-store.js';
import { DesktopProjectStoreContext } from '../desktop-project-store-context.js';
import { setActiveProjectStore } from '../active-project-store.js';
import { ProjectTree } from './project-tree.js';
import { TabsBar } from './tabs-bar.js';
import { SchemeView } from './scheme-view.js';
import { IconEditorColumn, ProjectRightSidebar } from './sidebar.js';
import { LogicExportConfigurationModal } from './logic-export-configuration-modal.js';
import { runLogicExport } from '../logic-export-runner.js';
import { runCodeExport } from '../code-export-runner.js';
import { DocumentLockOverlay } from './document-lock-overlay.js';
import { DocumentConflictModal } from './document-conflict-modal.js';
import { ExportProgressModal } from './export-progress-modal.js';
import { appTheme } from '../theme.js';

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    width: '100vw',
    overflow: 'hidden',
    background: appTheme.background,
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
  schemeCanvas: {
    position: 'relative' as const,
    flex: 1,
    display: 'flex',
    minWidth: 0,
    overflow: 'hidden',
  },
  welcome: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    color: appTheme.textMuted,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
  },
};

interface Props {
  projectDir: string;
  projectType: string;
}

export const ProjectWorkspace: React.FC<Props> = observer(({ projectDir, projectType }) => {
  // Created *inside* the effect, not `useMemo` — see `packages/workflow/client-common`'s
  // `ProjectWorkspace` (same fix, same reasoning, ADR 0021/0022's "Implementation notes"): under
  // React StrictMode's dev-only mount→cleanup→mount double-invoke, a `useMemo`-created store
  // survives the cycle unchanged (memoized values aren't recreated by it) while a *separate*
  // `useEffect` cleanup tied to that same value still fires on the fake unmount — disposing the
  // one-and-only `DesktopProjectStore` (tearing down `disposeFunctionsRegistrySync`/
  // `disposeTypesRegistrySync`/`disposeExternalApiRegistrySync`/`disposeRegistrySync` for good,
  // typically before `loadTree()`'s async IPC round-trip has even resolved) while the app keeps
  // using that same, now permanently-stale-registries instance for the rest of its life — every
  // `function`/`objects-structure`/`external-api-structure` document loaded afterward is invisible
  // to `call-function`'s target picker, struct-typed autocomplete, and `call-api`'s endpoint picker,
  // in dev mode only (`npm run dev`), never in a production build (StrictMode's double-invoke is
  // dev-only) — which is why a live pass against a built app can miss this entirely. Pairing
  // create/dispose in the same effect makes the double-invoke symmetric: StrictMode's extra
  // cleanup+re-run creates a fresh store the second time around, exactly as intended.
  const [store, setStore] = useState<DesktopProjectStore | null>(null);
  useEffect(() => {
    const nextStore = new DesktopProjectStore(projectDir, projectType);
    setStore(nextStore);
    setActiveProjectStore(nextStore);
    return () => {
      setActiveProjectStore(null);
      nextStore.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `App` keys this whole component on `projectDir` already, so `projectDir`/`projectType` never change together without a full remount
  }, [projectDir]);
  const [isExportConfigOpen, setExportConfigOpen] = useState(false);

  // These subscriptions all no-op (return a no-op unsubscribe) while `store` is still `null`
  // — the one short window before the effect above's `setStore` lands — rather than being skipped
  // outright, so every render calls the same fixed sequence of hooks (React's own rule: hooks
  // can't be called conditionally). The `if (!store) return null` below runs *after* every hook.
  useEffect(() => {
    const unsubscribe = globalThis.falang.menu.onOpenExportConfig(() => setExportConfigOpen(true));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!store) return;
    const unsubscribe = globalThis.falang.menu.onExportCode(() =>
      runLogicExport(store, { onNotConfigured: () => setExportConfigOpen(true) }),
    );
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    if (!store) return;
    const unsubscribe = globalThis.falang.menu.onExportCodeDocuments(() => runCodeExport(store));
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    if (!store) return;
    const unsubscribe = globalThis.falang.menu.onToggleVersionHistory(() => store.toggleRightPanel('history'));
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    if (!store) return;
    const unsubscribe = globalThis.falang.menu.onToggleAgent(() => store.toggleRightPanel('agent'));
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    if (!store) return;
    const unsubscribe = globalThis.falang.menu.onExportPdf(() => store.openPrintExport());
    return unsubscribe;
  }, [store]);

  const [treeWidth, onTreeResizeStart] = useResizablePanelWidth('falang:panel-width:project-tree', 220, {
    min: 160,
    max: 480,
    direction: 'right',
  });

  if (!store) return null;

  const activeId = store.activeTabId;
  const scheme = activeId ? store.getScheme(activeId) : null;
  const activeLock = activeId ? store.getLock(activeId) : null;
  const reloadVersion = activeId ? store.getReloadVersion(activeId) : 0;

  return (
    <DesktopProjectStoreContext value={store}>
      <div style={styles.root}>
        <div style={styles.body}>
          <div style={{ ...styles.projectTree, width: treeWidth }}>
            <ProjectTree />
          </div>
          <ResizeHandle onPointerDown={onTreeResizeStart} style={{ borderRight: `1px solid ${appTheme.border}` }} />

          <div style={styles.main}>
            <TabsBar />
            {scheme ? (
              <ContainerContext value={scheme.container}>
                <div style={styles.content}>
                  <div style={styles.schemeCanvas}>
                    {/* Keyed on the reload version too, not just the tab id — a document reloaded
                        in place (ADR 0029 (private)'s watcher) needs a fresh `Scheme` built from
                        the newly-read root, the same "change the key to force a remount" mechanism
                        already used for switching tabs. */}
                    <SchemeView key={`${activeId}:${reloadVersion}`} scheme={scheme} />
                    {activeLock ? <DocumentLockOverlay lock={activeLock} /> : null}
                  </div>
                  <IconEditorColumn />
                </div>
              </ContainerContext>
            ) : (
              <div style={styles.content}>
                <div style={styles.welcome}>
                  <div style={styles.welcomeText}>
                    {store.isLoadingTree ? 'Loading project…' : 'Create or open a document from the project tree'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Project-level, not per-scheme (ADR 0036 (private)
              §3) — a sibling of `main` above, outside any `ContainerContext`, so it's never unmounted
              by a tab switch or by the welcome state above. */}
          <ProjectRightSidebar />
        </div>
      </div>
      <LogicExportConfigurationModal
        store={store}
        open={isExportConfigOpen}
        onClose={() => setExportConfigOpen(false)}
        onExport={() => runLogicExport(store, { onNotConfigured: () => setExportConfigOpen(true) })}
      />
      <DocumentConflictModal />
      <ExportProgressModal />
      {store.printExport && (
        <>
          <PrintExportModal
            store={store.printExport}
            open={store.printExport.stage === 'select'}
            // Cancel only: "Print" has already switched the store to its preview stage, which `PrintLayer` owns.
            onClose={() => {
              if (store.printExport?.stage === 'select') store.closePrintExport();
            }}
          />
          <PrintLayer store={store.printExport} onClose={() => store.closePrintExport()} />
        </>
      )}
      <VersionDiffModal
        open={store.diffModalOpen}
        store={store.versionHistory}
        buildReadOnlyScheme={store.buildReadOnlySchemeForDiff}
        onClose={() => store.closeDiffModal()}
      />
    </DesktopProjectStoreContext>
  );
});
