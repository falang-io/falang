import { makeObservable, observable, ObservableMap } from 'mobx';
import type { NodeStore } from './node.store.js';

export class NodesTreeStore {
  readonly registry = new ObservableMap<string, NodeStore>();
  @observable root: NodeStore | null = null;

  constructor() {
    makeObservable(this);
  }
}
