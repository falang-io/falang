import type { TVariableInfo } from '@falang/typescript-dto';
import { action, computed, makeObservable, observable, ObservableMap } from 'mobx';

export interface ITypeRegistryObjectItem {
  type: 'object';
  id: string;
  parentId: string;
  name: string;
  properties: Record<string, TVariableInfo>;
}

export type ITypesRegistryItem = ITypeRegistryObjectItem;

/**
 * Narrows what the struct pickers offer (`pickerTypes`). Called with every registered type in one batch, from a
 * MobX computed, so whatever observables it reads become dependencies. It never removes anything from `types` —
 * Monaco scope code and the compilers still resolve every registered struct.
 */
export type TTypesPickerFilter = (items: readonly ITypeRegistryObjectItem[]) => ITypeRegistryObjectItem[];

export class TypesRegistryStore {
  readonly types = new ObservableMap<string, ITypeRegistryObjectItem>();

  @observable.ref private pickerFilter: TTypesPickerFilter | null = null;

  constructor() {
    makeObservable(this);
  }

  /** The struct types a type picker lists: every registered type, narrowed by the host's `setPickerFilter`. */
  @computed get pickerTypes(): ITypeRegistryObjectItem[] {
    const all = [...this.types.values()];
    return this.pickerFilter ? this.pickerFilter(all) : all;
  }

  @action setPickerFilter(filter: TTypesPickerFilter | null) {
    this.pickerFilter = filter;
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
