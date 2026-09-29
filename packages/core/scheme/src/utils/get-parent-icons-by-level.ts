// oxlint-disable no-bitwise
import type { IconStore } from '../store/icon.store.js';
import type { IconFlags } from '../types/icon-flags.js';
import { checker } from '../checker.js';

export const getParentIconsByFlag = (icon: IconStore, flag: IconFlags): IconStore[] => {
  const currentIconIsGood = checker.hasFlag(icon, flag);
  const parent = icon.parent ? getParentIconsByFlag(icon, flag) : [];
  if (currentIconIsGood) {
    return [icon, ...parent];
  }
  return parent;
};
