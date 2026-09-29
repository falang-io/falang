import { ObservableMap } from 'mobx';
import type { IconStore } from '../store/icon.store.js';

export class SchemeIconsStore {
  private readonly icons = new ObservableMap<string, IconStore>();

  add(icon: IconStore) {
    this.icons.set(icon.id, icon);
  }

  get(id: string): IconStore | null {
    return this.getIconSafe(id);
  }

  delete(id: string) {
    this.icons.delete(id);
  }

  getIcon(id: string): IconStore {
    const icon = this.icons.get(id);
    if (!icon) throw new Error(`Icon ${id} not found`);
    return icon;
  }

  getIconSafe(id: string): IconStore | null {
    const icon = this.icons.get(id);
    if (!icon) return null;
    return icon;
  }

  get all() {
    return Array.from(this.icons.values());
  }
}
