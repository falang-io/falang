import { describe, expect, it } from 'vitest';
import { loadProjectTabs, projectTabsStorageKey, restoreProjectTabs, saveProjectTabs } from './project-tabs-storage.js';

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
};

describe('project tabs storage', () => {
  it('uses the documented key', () => {
    expect(projectTabsStorageKey('p1')).toBe('falang:project-tabs:p1');
  });

  it('round-trips and tolerates garbage', () => {
    const storage = memoryStorage();
    expect(loadProjectTabs('p', storage)).toBeNull();
    saveProjectTabs('p', { openTabIds: ['a', 'b'], activeTabId: 'b' }, storage);
    expect(loadProjectTabs('p', storage)).toEqual({ openTabIds: ['a', 'b'], activeTabId: 'b' });
    storage.setItem(projectTabsStorageKey('p'), '{oops');
    expect(loadProjectTabs('p', storage)).toBeNull();
    storage.setItem(projectTabsStorageKey('p'), JSON.stringify({ openTabIds: ['a', 5], activeTabId: 7 }));
    expect(loadProjectTabs('p', storage)).toEqual({ openTabIds: ['a'], activeTabId: null });
  });
});

const exists = (id: string) => id !== 'gone';

describe('restoreProjectTabs', () => {
  it('skips deleted documents and keeps the saved active tab', () => {
    expect(restoreProjectTabs({ openTabIds: ['a', 'gone', 'b'], activeTabId: 'a' }, exists)).toEqual({
      openTabIds: ['a', 'b'],
      activeTabId: 'a',
    });
  });

  it('falls back to the last tab when the active one was deleted', () => {
    expect(restoreProjectTabs({ openTabIds: ['a', 'b', 'gone'], activeTabId: 'gone' }, exists)).toEqual({
      openTabIds: ['a', 'b'],
      activeTabId: 'b',
    });
  });

  it('lets the URL document win, adding its tab when missing', () => {
    expect(restoreProjectTabs({ openTabIds: ['a'], activeTabId: 'a' }, exists, 'c')).toEqual({
      openTabIds: ['a', 'c'],
      activeTabId: 'c',
    });
    expect(restoreProjectTabs({ openTabIds: ['a', 'c'], activeTabId: 'a' }, exists, 'c').openTabIds).toEqual([
      'a',
      'c',
    ]);
  });

  it('ignores an unknown URL document and handles nothing saved', () => {
    expect(restoreProjectTabs(null, exists, 'gone')).toEqual({ openTabIds: [], activeTabId: null });
    expect(restoreProjectTabs(null, exists, 'x')).toEqual({ openTabIds: ['x'], activeTabId: 'x' });
  });
});
