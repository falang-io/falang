import { checker } from '../checker.js';
import type { Scheme } from '../scheme/scheme.js';

export const isIconDeletable = (scheme: Scheme, id: string): boolean => {
  const icon = scheme.icons.getIconSafe(id);
  if (!icon) return false;
  const parent = icon.parent;
  if (!parent) return false;
  if (parent.mods.some((mod) => mod.id === id)) return true;
  if (checker.isWithSkewer(parent)) return true;
  if (checker.isWithThreads(parent)) return parent.threads.size > 1;
  return false;
};
