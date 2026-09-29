import { ObservableMap, action, makeObservable } from 'mobx';
import type { IconStore } from './icon.store.js';

export class IconsRegistryStore {
  private readonly icons = new ObservableMap<string, IconStore>();

  constructor() {
    makeObservable(this);
  }

  @action add(icon: IconStore): void {
    if (this.icons.has(icon.id)) {
      throw new Error(`icon with id ${icon.id} already exists`);
    }
    this.icons.set(icon.id, icon);
  }

  @action remove(icon: IconStore): void {
    this.icons.delete(icon.id);
  }

  get(id: string): IconStore {
    const icon = this.icons.get(id);
    if (!icon) {
      throw new Error(`icon #${id} not found`);
    }
    return icon;
  }

  getSafe(id: string | null): IconStore | null {
    if (!id) return null;
    const icon = this.icons.get(id);
    return icon ?? null;
  }

  has(id: string): boolean {
    return this.icons.has(id);
  }

  dispose(): void {
    for (const icon of this.icons.values()) {
      icon.dispose();
    }
    this.icons.clear();
  }
}
