import type { TVariableInfo } from '@falang/typescript-dto';
import { action, makeObservable, ObservableMap } from 'mobx';

export interface ITypeRegistryObjectItem {
  type: 'object';
  id: string;
  parentId: string;
  name: string;
  properties: Record<string, TVariableInfo>;
}

export type ITypesRegistryItem = ITypeRegistryObjectItem;

export class TypesRegistryStore {
  readonly types = new ObservableMap<string, ITypeRegistryObjectItem>();

  constructor() {
    makeObservable(this);
  }

  @action updateTypesByParent(parentId: string, types: ITypesRegistryItem[]) {
    const currentIds: string[] = [];
    this.types.forEach((value, key) => {
      if (value.parentId === parentId) {
        currentIds.push(key);
      }
    });
    const newIds = new Set(types.map((t) => t.id));
    const toDeleteIds = currentIds.filter((curr) => !newIds.has(curr));
    toDeleteIds.forEach((id) => this.types.delete(id));
    types.forEach((t) => this.types.set(t.id, t));
  }

  dispose() {
    this.types.clear();
  }
}
