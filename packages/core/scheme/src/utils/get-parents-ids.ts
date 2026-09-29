import type { IconStore } from '../store/icon.store.js';

export const getParentsIds = (icon: IconStore): string[] => {
  const parent = icon.parent;
  if (!parent) return [];
  return [parent.id, ...getParentsIds(parent)];
};
