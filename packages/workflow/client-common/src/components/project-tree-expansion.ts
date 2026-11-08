import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkflowStore } from '../workflow-store.js';
import { idOf } from './project-tree-helpers.js';
import { loadExpandedKeys, saveExpandedKeys, withFixedFoldersExpanded } from './project-tree-model.js';

/**
 * Expanded folders of the project tree: remembered per project, new folders open, and the section
 * folders always expanded (`expandedKeys` already includes them, and they can't be collapsed).
 */
export const useProjectTreeExpansion = (store: WorkflowStore) => {
  const [storedKeys, setStoredKeys] = useState<React.Key[]>([]);
  const prevFolderIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const existing = prevFolderIdsRef.current;
    const isFirstLoad = existing.size === 0;
    const stored = isFirstLoad ? loadExpandedKeys(store.projectId) : null;
    const known = new Set(store.folders.map((f) => f.id));
    if (stored) {
      setStoredKeys(stored.filter((key) => known.has(idOf(String(key)))));
    } else {
      const newKeys = store.folders.filter((f) => !existing.has(f.id)).map((f): React.Key => `folder:${f.id}`);
      if (newKeys.length > 0) setStoredKeys((keys) => [...keys, ...newKeys]);
    }
    prevFolderIdsRef.current = known;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.folders.length]);

  useEffect(() => {
    if (store.folders.length > 0) saveExpandedKeys(store.projectId, storedKeys.map(String));
  }, [storedKeys, store.folders.length, store.projectId]);

  const expandedKeys = withFixedFoldersExpanded(storedKeys.map(String), store.folders);

  const setExpandedKeys = useCallback(
    (update: (keys: React.Key[]) => React.Key[]) =>
      setStoredKeys((keys) => withFixedFoldersExpanded(update(keys).map(String), store.folders)),
    [store],
  );

  /** Expands a folder (no-op when it is already open). */
  const expandFolder = useCallback(
    (folderId: string) => {
      const key = `folder:${folderId}`;
      setExpandedKeys((keys) => (keys.includes(key) ? keys : [...keys, key]));
    },
    [setExpandedKeys],
  );

  const toggleFolder = useCallback(
    (key: string) => setExpandedKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key])),
    [setExpandedKeys],
  );

  const handleExpand = useCallback((keys: React.Key[]) => setExpandedKeys(() => keys), [setExpandedKeys]);

  return { expandedKeys, expandFolder, toggleFolder, handleExpand };
};
