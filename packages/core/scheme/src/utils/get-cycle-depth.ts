import { checker } from '../checker.js';
import type { IconStore } from '../store/icon.store.js';

export const getCycleDepth = (icon: IconStore): number => {
  const parent = icon.parent;
  if (!parent) return 0;
  return getCycleDepth(parent) + (checker.isCycle(parent) ? 1 : 0);
};
