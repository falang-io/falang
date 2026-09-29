import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { ContainerContext } from '@falang/scheme';
import { ResizeHandle, useResizablePanelWidth, VersionDiffModal } from '@falang/antd';
import { ArduinoProjectStore } from '../arduino-project-store.js';
import { ArduinoProjectStoreContext } from '../arduino-project-store-context.js';
import { setActiveProjectStore } from '../active-project-store.js';
import { DEVICES_DOCUMENT_TYPE } from '../../../shared/devices-document.js';
import { ProjectTree } from './project-tree.js';
import { TabsBar } from './tabs-bar.js';
import { SchemeView } from './scheme-view.js';
import { DevicesEditor } from './devices-editor.js';
import { IconEditorColumn, ProjectRightSidebar } from './sidebar.js';
import { BuildPanelModal } from './build-panel-modal.js';
import { DocumentLockOverlay } from './document-lock-overlay.js';
import { DocumentConflictModal } from './document-conflict-modal.js';
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
}

export const ProjectWorkspace: React.FC<Props> = observer(({ projectDir }) => {
  // Deliberately not `useMemo(() => new ArduinoProjectStore(...), [projectDir])` + a separate
  // disposing `useEffect` — that asymmetric pair breaks under React 18 dev StrictMode's
  // mount→cleanup→mount double-invoke: the fake first cleanup disposes the one-and-only store
  // (unsubscribing `DebugSessionStore` from its adapter for good), while `useMemo` survives that
  // cycle and keeps handing out the same, now-permanently-broken instance. Creating and disposing
  // inside the same effect makes that cycle symmetric regardless of how many times StrictMode
  // replays it — the same fix the workflow client's `ProjectWorkspace` needed for the identical bug
  // (see ADR 0021 (private)'s Phase 1 implementation notes).
  const [store, setStore] = useState<ArduinoProjectStore | null>(null);
  useEffect(() => {
    const created = new ArduinoProjectStore(projectDir);
    setStore(created);
    setActiveProjectStore(created);
    return () => {
      setActiveProjectStore(null);
      created.dispose();
    };
  }, [projectDir]);
  const [isBuildPanelOpen, setBuildPanelOpen] = useState(false);

  useEffect(() => {
    if (!store) return;
    const unsubscribe = globalThis.falang.menu.onSaveDocument(() => store.saveAllOpenTabsNow());
    return unsubscribe;
  }, [store]);

  useEffect(() => {
    const unsubscribe = globalThis.falang.menu.onOpenBuildPanel(() => setBuildPanelOpen(true));
    return unsubscribe;
  }, []);

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

  const [treeWidth, onTreeResizeStart] = useResizablePanelWidth('falang:panel-width:project-tree', 220, {
    min: 160,
    max: 480,
    direction: 'right',
  });

  if (!store) return null;

  const activeId = store.activeTabId;
  const activeDocument = activeId ? store.getDocument(activeId) : null;
  // The `devices` document has no scheme/node tree at all (ADR 0032 (private),
  // "Decision → 3") — `getScheme` throws for it, so it must never be called for this tab; `DevicesEditor`
  // takes over the main content area instead, the same `isIntegrationsDoc ? <IntegrationsEditor/> : …`
  // split the workflow product's own `ProjectWorkspace` uses for its own `custom` document.
  const isDevicesDoc = activeDocument?.type === DEVICES_DOCUMENT_TYPE;
  const scheme = activeId && !isDevicesDoc ? store.getScheme(activeId) : null;
  const activeLock = activeId ? store.getLock(activeId) : null;
  const reloadVersion = activeId ? store.getReloadVersion(activeId) : 0;

  // Three mutually exclusive cases, pulled out of the JSX as an if-chain rather than a nested
  // ternary (oxlint's `no-nested-ternary` — mirrors the workflow product's own `ProjectWorkspace`,
  // which uses the identical IIFE shape for its own three-way `isIntegrationsDoc`/`scheme`/welcome
  // split).
  const mainContent = (() => {
    if (scheme) {
      return (
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
      );
    }
    if (isDevicesDoc && activeId) {
      return (
        <div style={styles.content}>
          <div style={styles.schemeCanvas}>
            <DevicesEditor store={store} documentId={activeId} />
            {activeLock ? <DocumentLockOverlay lock={activeLock} /> : null}
          </div>
        </div>
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
    <ArduinoProjectStoreContext value={store}>
      <div style={styles.root}>
        <div style={styles.body}>
          <div style={{ ...styles.projectTree, width: treeWidth }}>
            <ProjectTree />
          </div>
          <ResizeHandle onPointerDown={onTreeResizeStart} style={{ borderRight: `1px solid ${appTheme.border}` }} />

          <div style={styles.main}>
            <TabsBar />
            {mainContent}
          </div>

          {/* Project-level, not per-scheme (ADR 0036 (private)
              §3) — a sibling of `main` above, outside any `ContainerContext`, so it's never unmounted
              by a tab switch, the `Devices` editor, or the welcome state above. */}
          <ProjectRightSidebar />
        </div>
      </div>
      <BuildPanelModal store={store} open={isBuildPanelOpen} onClose={() => setBuildPanelOpen(false)} />
      <DocumentConflictModal />
      <VersionDiffModal
        open={store.diffModalOpen}
        store={store.versionHistory}
        buildReadOnlyScheme={store.buildReadOnlySchemeForDiff}
        onClose={() => store.closeDiffModal()}
      />
    </ArduinoProjectStoreContext>
  );
});
