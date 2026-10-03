/** A project's remembered editor tabs: restored when the project is opened again (reload, re-entry). */
export interface IProjectTabs {
  openTabIds: string[];
  activeTabId: string | null;
}

export const projectTabsStorageKey = (projectId: string): string => `falang:project-tabs:${projectId}`;

type TStorage = Pick<Storage, 'getItem' | 'setItem'>;

const defaultStorage = (): TStorage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

/** `null` when nothing (valid) is stored or storage is unavailable. */
export const loadProjectTabs = (
  projectId: string,
  storage: TStorage | null = defaultStorage(),
): IProjectTabs | null => {
  try {
    const raw = storage?.getItem(projectTabsStorageKey(projectId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { openTabIds, activeTabId } = parsed as { openTabIds?: unknown; activeTabId?: unknown };
    if (!Array.isArray(openTabIds)) return null;
    return {
      openTabIds: openTabIds.filter((id): id is string => typeof id === 'string'),
      activeTabId: typeof activeTabId === 'string' ? activeTabId : null,
    };
  } catch {
    return null;
  }
};

export const saveProjectTabs = (
  projectId: string,
  tabs: IProjectTabs,
  storage: TStorage | null = defaultStorage(),
): void => {
  try {
    storage?.setItem(projectTabsStorageKey(projectId), JSON.stringify(tabs));
  } catch {
    // storage unavailable or full — tabs just aren't remembered
  }
};

/**
 * The tabs to open now: the saved ones minus documents that no longer exist (deleted meanwhile), plus
 * `preferredActiveId` (e.g. from the URL) made active — added to the open list when it had no tab yet.
 * Without a usable preference, the saved active tab if it survived, else the last remaining one.
 */
export const restoreProjectTabs = (
  saved: IProjectTabs | null,
  exists: (documentId: string) => boolean,
  preferredActiveId: string | null = null,
): IProjectTabs => {
  const openTabIds = (saved ? [...new Set(saved.openTabIds)] : []).filter((id) => exists(id));
  if (preferredActiveId && exists(preferredActiveId)) {
    if (!openTabIds.includes(preferredActiveId)) openTabIds.push(preferredActiveId);
    return { openTabIds, activeTabId: preferredActiveId };
  }
  const savedActive = saved?.activeTabId ?? null;
  const activeTabId = savedActive && openTabIds.includes(savedActive) ? savedActive : (openTabIds.at(-1) ?? null);
  return { openTabIds, activeTabId };
};
