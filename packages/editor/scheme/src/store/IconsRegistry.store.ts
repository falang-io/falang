import { ObservableMap, action, makeObservable, ObservableSet, computed, runInAction } from 'mobx';
import { checker } from '../checker';
import { IconStore } from '../icons/base/Icon.store';
import { IIconList } from '../icons/base/IIconList';
import { IValencePointsRegisterItem } from './ValencePointsRegisterer.store';

export class IconsRegistryStore {
  private readonly icons = new ObservableMap<string, IconStore>();
  private readonly lists = new ObservableSet<IIconList>();

  constructor() {
    makeObservable(this);
  }

  @action add(icon: IconStore) {
    if(this.icons.has(icon.id)) {
      throw new Error(`Icon with id ${icon.id} already exists`);
    }
    this.icons.set(icon.id, icon);
    if(checker.isIconWithList(icon)) {
      // добавление происходит в конструкторе, в это время список еще не создан
      setTimeout(() => {
        runInAction(() => {
          this.lists.add(icon.list);
        });        
      });     
    }
  }

  forEach(cb: (icon: IconStore) => void) {
    this.icons.forEach(cb);
  }

  @action remove(icon: IconStore) {
    this.icons.delete(icon.id);
    if(checker.isIconWithList(icon)) {
      this.lists.delete(icon.list);
    }
  }

  get(id: string): IconStore {
    const icon = this.icons.get(id);
    if(!icon) {
      throw new Error(`Icon #${id} not found`);
    }
    return icon;
  }

  getSafe(id: string): IconStore | null {
    const icon = this.icons.get(id);
    return icon ?? null;
  }

  dispose() {
    for(const icon of this.icons.values()) {
      icon.dispose();
    }
    this.icons.clear();
  }

  @computed get valencePoints(): IValencePointsRegisterItem[] {
    const arrays: IValencePointsRegisterItem[][] = [];
    for(const list of this.lists) {
      arrays.push(list.valencePoints);
    }
    return arrays.flat();
  }

  onIconLoad(id: string, cb: () => void) {

  }
}
