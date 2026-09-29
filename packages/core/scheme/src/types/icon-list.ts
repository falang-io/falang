import type { IconStore } from '../store/icon.store.js';
import type { IIconOutLine } from './icon-outline.js';
import type { IValencePoint } from './valence-point-item.js';

export type TIconListType = 'skewer' | 'threads';

export interface IIconList {
  icons: readonly IconStore[];
  size: number;
  getAtIndex(index: number): IconStore | undefined;
  getIconIndex(iconId: string): number;
  splice(index: number, deleteCount?: number, newItems?: IconStore[]): IconStore[];
  replace(icons: IconStore[]): void;
  push(...args: IconStore[]): void;
  remove(index: number): void;
  iconsIds: string[];
  removeIcon(icon: IconStore): void;
  deleteIcon(icon: IconStore): void;
  valencePoints: IValencePoint[];
  getType(): TIconListType;
  parentId: string;
  outLines: IIconOutLine[];
}

export interface IIconWithList extends IconStore {
  list: IIconList;
}
