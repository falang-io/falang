import { action, makeObservable, observable, ObservableMap } from 'mobx';
import { IconsRegistryStore } from './IconsRegistry.store';

export class IconsEnumeratorStore {
  @observable private _enabled = false;
  private readonly _iconsIndexHash = new ObservableMap<string, number>();

  constructor(private registry: IconsRegistryStore) {
    makeObservable(this);
  }

  getIconIndex(iconId: string): number | null {
    if (!this._enabled) return null;
    return this._iconsIndexHash.get(iconId) ?? null;
  }

  get isEnabled() {
    return this._enabled;
  }

  @action setEnabled(enabled: boolean) {
    this._enabled = enabled;
    if (enabled) {
      this.sort();
    }
  }

  @action private sort() {
    this._iconsIndexHash.clear();
    const enumerationItems: IconEnumerationItem[] = [];
    this.registry.forEach((icon) => {
      if (icon.position.y <= 0 || icon.block.shape.height === 0) return;
      enumerationItems.push({
        id: icon.id,
        x: icon.position.x,
        y: icon.position.y,
      });
    });
    enumerationItems.sort((a, b) => {
      if (a.x === b.x) return a.y - b.y;
      return a.x - b.x;
    });
    enumerationItems.forEach((item, index) => {
      this._iconsIndexHash.set(item.id, index + 1);
    });
  }
}

interface IconEnumerationItem {
  id: string,
  x: number,
  y: number
}