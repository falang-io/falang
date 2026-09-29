import type { IIconStoreWithChildren } from '../checker.js';
import type { IconStore } from '../store/icon.store.js';

export const getIconAtIndexOrFail = <T extends IconStore = IconStore>(
  icon: IIconStoreWithChildren,
  index: number,
): T => {
  const child = icon.children[index];
  if (!child) throw new Error(`Not found icon at index ${index} in ${icon.name}#${icon.id}`);
  return child as T;
};
