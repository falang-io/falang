import { runInAction, observable } from 'mobx';
import { describe, expect, it } from 'vitest';
import { NavigationStore } from './navigation-store.js';
import { projectTabsStorageKey } from './project-tabs-storage.js';
import { startWorkspaceSync, type IWorkspaceSyncStore } from './workspace-sync.js';

const memoryStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
};

const createFakeStore = (documents: string[], overrides: Partial<{ connectionError: string | null }> = {}) => {
  const state = observable({
    isLoadingTree: true,
    isLoadingDocuments: true,
    connectionError: overrides.connectionError ?? null,
    openTabIds: [] as string[],
    activeTabId: null as string | null,
    activeView: null as 'files' | 'tasks' | null,
  });
  const store: IWorkspaceSyncStore = {
    projectId: 'p1',
    get isLoadingTree() {
      return state.isLoadingTree;
    },
    get isLoadingDocuments() {
      return state.isLoadingDocuments;
    },
    get connectionError() {
      return state.connectionError;
    },
    get openTabIds() {
      return state.openTabIds;
    },
    get activeTabId() {
      return state.activeTabId;
    },
    get activeView() {
      return state.activeView;
    },
    hasDocument: (id) => documents.includes(id),
    restoreTabs: (tabs) =>
      runInAction(() => {
        state.openTabIds = tabs.openTabIds;
        state.activeTabId = tabs.activeTabId;
      }),
    setActiveView: (view) => runInAction(() => (state.activeView = view)),
    openTab: (id) =>
      runInAction(() => {
        state.activeView = null;
        if (!state.openTabIds.includes(id)) state.openTabIds = [...state.openTabIds, id];
        state.activeTabId = id;
      }),
  };
  const finishLoading = () =>
    runInAction(() => {
      state.isLoadingTree = false;
      state.isLoadingDocuments = false;
    });
  return { state, store, finishLoading };
};

describe('startWorkspaceSync', () => {
  it('restores saved tabs after load, skipping deleted documents, and publishes the active one', () => {
    const storage = memoryStorage({
      [projectTabsStorageKey('p1')]: JSON.stringify({ openTabIds: ['a', 'gone', 'b'], activeTabId: 'b' }),
    });
    const nav = new NavigationStore();
    nav.selectProject('p1', 'P');
    const { state, store, finishLoading } = createFakeStore(['a', 'b']);
    startWorkspaceSync(store, nav, storage);
    expect(state.openTabIds).toEqual([]);
    finishLoading();
    expect(state.openTabIds).toEqual(['a', 'b']);
    expect(state.activeTabId).toBe('b');
    expect(nav.documentId).toBe('b');
  });

  it('prefers the document from the URL', () => {
    const nav = new NavigationStore();
    nav.applyRoute({ kind: 'project', projectId: 'p1', documentId: 'a', view: null });
    const { state, store, finishLoading } = createFakeStore(['a', 'b']);
    startWorkspaceSync(store, nav, memoryStorage());
    finishLoading();
    expect(state.activeTabId).toBe('a');
    expect(state.openTabIds).toEqual(['a']);
  });

  it('saves tab changes and publishes them; Back/Forward style nav changes open the document', () => {
    const storage = memoryStorage();
    const nav = new NavigationStore();
    nav.selectProject('p1', 'P');
    const { state, store, finishLoading } = createFakeStore(['a', 'b']);
    startWorkspaceSync(store, nav, storage);
    finishLoading();
    store.openTab('a');
    store.openTab('b');
    expect(JSON.parse(storage.map.get(projectTabsStorageKey('p1')) ?? '{}')).toEqual({
      openTabIds: ['a', 'b'],
      activeTabId: 'b',
    });
    expect(nav.documentId).toBe('b');
    nav.setProjectLocation('a', null);
    expect(state.activeTabId).toBe('a');
    nav.setProjectLocation(null, 'files');
    expect(state.activeView).toBe('files');
  });

  it('does nothing when the project failed to load', () => {
    const storage = memoryStorage();
    const nav = new NavigationStore();
    nav.selectProject('p1', 'P');
    const { store, finishLoading } = createFakeStore([], { connectionError: 'boom' });
    startWorkspaceSync(store, nav, storage);
    finishLoading();
    expect(storage.map.size).toBe(0);
  });

  it('ignores navigation to another project', () => {
    const nav = new NavigationStore();
    nav.selectProject('other', 'O');
    const { state, store, finishLoading } = createFakeStore(['a']);
    startWorkspaceSync(store, nav, memoryStorage());
    finishLoading();
    store.openTab('a');
    expect(state.activeTabId).toBe('a');
    expect(nav.documentId).toBeNull();
  });
});
