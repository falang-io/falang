import { reaction, when, type IReactionDisposer } from 'mobx';
import { navigationStore, type NavigationStore } from './navigation-store.js';
import type { TProjectRouteView } from './navigation-url.js';
import { loadProjectTabs, restoreProjectTabs, saveProjectTabs, type IProjectTabs } from './project-tabs-storage.js';

/** The slice of `WorkflowStore` the tab/URL synchronization uses — keeps it testable without the whole store. */
export interface IWorkspaceSyncStore {
  readonly projectId: string;
  readonly isLoadingTree: boolean;
  readonly isLoadingDocuments: boolean;
  readonly connectionError: string | null;
  readonly openTabIds: readonly string[];
  readonly activeTabId: string | null;
  readonly activeView: TProjectRouteView | 'files' | 'tasks' | null;
  hasDocument(documentId: string): boolean;
  restoreTabs(tabs: IProjectTabs): void;
  setActiveView(view: TProjectRouteView | null): void;
  openTab(documentId: string): void;
}

type TStorage = Parameters<typeof loadProjectTabs>[1];

/**
 * Ties one open project's editor tabs to (a) `localStorage` (`falang:project-tabs:<projectId>`) and
 * (b) the URL via `NavigationStore` (see `bindNavigationToUrl`):
 *  - once the project's tree and documents are loaded (opening a tab earlier would build its scheme
 *    from a still-empty document), the remembered tabs are restored — minus deleted documents — and a
 *    document/view named by the URL wins as the active one;
 *  - from then on every tab change is saved, published to the navigation state (so the hash follows),
 *    and a navigation-state change that did not come from here (Back/Forward, an edited hash) opens
 *    that document/view.
 * Skipped entirely when the project failed to load, so a transient error never overwrites saved tabs.
 * Returns the disposer.
 */
export const startWorkspaceSync = (
  store: IWorkspaceSyncStore,
  nav: NavigationStore = navigationStore,
  storage?: TStorage,
): (() => void) => {
  const disposers: IReactionDisposer[] = [];
  const isCurrentProject = (): boolean => nav.selectedProjectId === store.projectId;

  const publish = () => {
    if (!isCurrentProject()) return;
    const view = store.activeView;
    nav.setProjectLocation(view ? null : store.activeTabId, view);
  };

  const start = () => {
    if (store.connectionError) return;
    const urlDocumentId = isCurrentProject() ? nav.documentId : null;
    store.restoreTabs(
      restoreProjectTabs(loadProjectTabs(store.projectId, storage), (id) => store.hasDocument(id), urlDocumentId),
    );
    if (isCurrentProject() && nav.projectView) store.setActiveView(nav.projectView);
    publish();

    disposers.push(
      reaction(
        () => [store.activeTabId, store.activeView],
        () => publish(),
      ),
      reaction(
        () => ({ openTabIds: [...store.openTabIds], activeTabId: store.activeTabId }),
        (tabs) => saveProjectTabs(store.projectId, tabs, storage),
        {
          fireImmediately: true,
          equals: (a, b) => a.activeTabId === b.activeTabId && a.openTabIds.join(',') === b.openTabIds.join(','),
        },
      ),
      reaction(
        () => [nav.documentId, nav.projectView] as const,
        ([documentId, view]) => {
          if (!isCurrentProject()) return;
          if (view) {
            store.setActiveView(view);
          } else if (
            documentId &&
            store.hasDocument(documentId) &&
            (store.activeTabId !== documentId || store.activeView)
          ) {
            store.openTab(documentId);
          }
        },
      ),
    );
  };

  disposers.push(when(() => !store.isLoadingTree && !store.isLoadingDocuments, start));
  return () => {
    for (const dispose of disposers) dispose();
  };
};
