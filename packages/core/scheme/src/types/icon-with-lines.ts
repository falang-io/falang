import type { ILineParams } from '../cmp/line.js';
import type { IconStore } from '../store/icon.store.js';

export interface IIconWithOwnLines extends IconStore {
  ownLines: ILineParams[];
}

export interface IIconWithLines extends IconStore {
  lines: ILineParams[];
}
