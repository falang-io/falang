import { SchemeStore } from '../../store/Scheme.store';
import type { IValencePointsRegisterItem } from '../../store/ValencePointsRegisterer.store';
import type { IconStore } from './Icon.store';

export type TIconListType = 'skewer' | 'threads';

export interface IIconList<TIconItem extends IconStore = IconStore> {
  icons: ReadonlyArray<TIconItem>
  size: number
  getAtIndex(index: number): TIconItem | undefined
  getIconIndex(iconId: string): number
  splice(index: number, deleteCount?: number, newItems?: TIconItem[]): TIconItem[]
  push(...args: TIconItem[]): void
  remove(index: number): void
  iconsIds: string[]
  removeIcon(icon: TIconItem): void
  deleteIcon(icon: TIconItem): void
  valencePoints: IValencePointsRegisterItem[]
  getType(): TIconListType;
  parentId: string;
  scheme: SchemeStore;
}

export interface IIconWithList<TIconItem extends IconStore = IconStore> extends IconStore {
  scheme: SchemeStore
  list: IIconList<TIconItem>
}
