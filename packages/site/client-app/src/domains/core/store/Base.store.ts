import type { RootStore } from './Root.store';

export class BaseStore {
  constructor(public root: RootStore) {}
}