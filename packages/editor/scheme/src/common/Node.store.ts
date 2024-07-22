import { action, computed, observable } from 'mobx';
import { SchemeStore } from '../store/Scheme.store';
import { PositionStore } from './store/Position.store';
import { ShapeStore } from './store/Shape.store';
import { TPath } from './TPath';

export interface INodeStoreParams {
  id: string;
  scheme: SchemeStore;
}

export class NodeStore {
  readonly shape = new ShapeStore();
  readonly position = new PositionStore();
  readonly scheme: SchemeStore;
  readonly id: string;
  @observable parentId: string | null = null;
  @observable childIds: string[] = [];

  constructor(params: INodeStoreParams) {
    this.scheme = params.scheme;
    this.id = params.id;
  }

  @action setParentId(parentId: string | null) {
    this.parentId = parentId;
  }
}