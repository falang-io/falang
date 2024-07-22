import { checker } from '@falang/editor-scheme';
import { IconStore } from '@falang/editor-scheme';

export const hasParentCycle = (icon?: IconStore): boolean => {
  if (!icon || !icon.parent) return false;
  if (checker.isCycle(icon.parent)) return true;
  return hasParentCycle(icon.parent);
};
