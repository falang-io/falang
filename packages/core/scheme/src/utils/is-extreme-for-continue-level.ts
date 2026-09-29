import { checker } from '../checker.js';
import type { IconStore } from '../store/icon.store.js';

export const isExtremeForContinueLevel = (icon: IconStore, level: number): boolean => {
  if (checker.isCycle(icon) && level <= 1) return true;
  if (checker.isWithSkewer(icon) && !icon.skewer.isLast) return false;
  const parent = icon.parent;
  if (!parent) return false;
  if (checker.isCycle(icon)) {
    return isExtremeForContinueLevel(parent, level - 1);
  }
  return isExtremeForContinueLevel(parent, level);
};
