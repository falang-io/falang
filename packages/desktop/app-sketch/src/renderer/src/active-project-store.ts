import type { DesktopProjectStore } from './desktop-project-store.js';

/**
 * The one `DesktopProjectStore` currently mounted (this app opens one project per window — see
 * `ProjectWorkspace`), if any. Plain module-level state rather than DI/context: `App`'s
 * graceful-close handling needs to reach it from outside `ProjectWorkspace`'s own subtree (and from
 * before any project is open at all), the same "no DI container in `main`" posture
 * `project-watcher-state.ts` already uses on the other side of the IPC boundary.
 */
let current: DesktopProjectStore | null = null;

export const setActiveProjectStore = (store: DesktopProjectStore | null): void => {
  current = store;
};

export const getActiveProjectStore = (): DesktopProjectStore | null => current;
