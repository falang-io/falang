import { describe, expect, it } from 'vitest';
import { NavigationStore } from './navigation-store.js';
import { bindNavigationToUrl } from './navigation-url-sync.js';

const createFakeWindow = (initialHash: string) => {
  const listeners = new Map<string, Set<() => void>>();
  const entries: string[] = [initialHash];
  let index = 0;
  const win = {
    location: {
      get hash() {
        return entries[index] ?? '';
      },
    },
    history: {
      pushState: (_state: unknown, _title: string, url?: string | URL | null) => {
        entries.splice(index + 1);
        entries.push(String(url));
        index += 1;
      },
      replaceState: (_state: unknown, _title: string, url?: string | URL | null) => {
        entries[index] = String(url);
      },
    },
    addEventListener: (type: string, listener: () => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: () => void) => listeners.get(type)?.delete(listener),
  };
  const go = (delta: number) => {
    index += delta;
    for (const listener of listeners.get('popstate') ?? []) listener();
  };
  return { entries, go, win, index: () => index };
};

describe('bindNavigationToUrl', () => {
  it('applies the initial hash to the store', () => {
    const { win } = createFakeWindow('#/projects/p1/documents/d1');
    const store = new NavigationStore();
    bindNavigationToUrl(store, win);
    expect(store.selectedProjectId).toBe('p1');
    expect(store.documentId).toBe('d1');
  });

  it('leaves state alone for a foreign hash', () => {
    const { win } = createFakeWindow('#/admin');
    const store = new NavigationStore();
    bindNavigationToUrl(store, win);
    expect(store.selectedProjectId).toBeNull();
    expect(win.location.hash).toBe('#/admin');
  });

  it('pushes on screen/project changes, replaces on tab switches within a project', () => {
    const { win, entries } = createFakeWindow('');
    const store = new NavigationStore();
    bindNavigationToUrl(store, win);
    store.selectProject('p1', 'One');
    expect(entries).toEqual(['', '#/projects/p1']);
    store.setProjectLocation('d1', null);
    store.setProjectLocation('d2', null);
    expect(entries).toEqual(['', '#/projects/p1/documents/d2']);
    store.goToRuns();
    expect(entries).toEqual(['', '#/projects/p1/documents/d2', '#/runs']);
  });

  it('follows back/forward', () => {
    const { win, go } = createFakeWindow('');
    const store = new NavigationStore();
    bindNavigationToUrl(store, win);
    store.selectProject('p1', 'One');
    store.setProjectLocation('d1', null);
    store.goToProjectList();
    go(-1);
    expect(store.selectedProjectId).toBe('p1');
    expect(store.documentId).toBe('d1');
    go(-1);
    expect(store.selectedProjectId).toBeNull();
    expect(store.view).toBe('projects');
  });

  it('does not push history entries while applying a hash', () => {
    const { win, entries, go } = createFakeWindow('');
    const store = new NavigationStore();
    bindNavigationToUrl(store, win);
    store.selectProject('p1', 'One');
    store.goToRuns();
    const before = entries.length;
    go(-1);
    expect(entries.length).toBe(before);
  });

  it('stops syncing after unbind', () => {
    const { win, entries } = createFakeWindow('');
    const store = new NavigationStore();
    const unbind = bindNavigationToUrl(store, win);
    unbind();
    store.goToRuns();
    expect(entries).toEqual(['']);
  });
});
