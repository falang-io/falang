import { action, makeObservable, ObservableMap } from 'mobx';
import type { ITheme } from '../types/theme.js';

type ICssRenderer = (theme: ITheme) => string;

export class CssClassesStore {
  private readonly iconsClasses = new ObservableMap<string, string[]>();
  private readonly blocksClasses = new ObservableMap<string, string[]>();
  private readonly rootExtraCss: ICssRenderer[] = [];

  constructor() {
    makeObservable(this);
  }

  @action addIconClass(id: string, className: string) {
    let current = this.iconsClasses.get(id);
    if (!current) {
      current = [];
      this.iconsClasses.set(id, current);
    }
    if (current.includes(className)) return;
    current.push(className);
  }

  @action removeIconClass(id: string, className: string) {
    const current = this.iconsClasses.get(id);
    if (!current || !current.includes(className)) return;
    if (current.length === 1) {
      this.iconsClasses.delete(id);
      return;
    }
    const newCurrent = current.filter((cl) => cl !== className);
    this.iconsClasses.set(id, newCurrent);
  }

  @action removeClassFromAllIcons(className: string) {
    for (const k of this.iconsClasses.keys()) {
      this.removeIconClass(k, className);
    }
  }

  @action removeIcon(id: string) {
    this.iconsClasses.delete(id);
    this.blocksClasses.delete(id);
  }

  @action addBlockClass(id: string, className: string) {
    let current = this.blocksClasses.get(id);
    if (!current) {
      current = [className];
      this.blocksClasses.set(id, current);
      return;
    }
    if (current.includes(className)) return;
    current.push(className);
  }

  @action removeBlockClass(id: string, className: string) {
    const current = this.blocksClasses.get(id);
    if (!current || !current.includes(className)) return;
    if (current.length === 1) {
      this.blocksClasses.delete(id);
      return;
    }
    const newCurrent = current.filter((cl) => cl !== className);
    this.blocksClasses.set(id, newCurrent);
  }

  @action removeClassFromAllBlocks(className: string) {
    for (const k of this.blocksClasses.keys()) {
      this.removeBlockClass(k, className);
    }
  }

  getIconClassName(id: string): string | undefined {
    const classNames = this.iconsClasses.get(id);
    // oxlint-disable-next-line no-undefined
    if (!classNames) return undefined;
    return classNames.join(' ');
  }

  getBlockBodyClassName(id: string): string {
    const classes = this.blocksClasses.get(id);
    const classNames = ['block-body', ...(classes || [])];
    return classNames.join(' ');
  }

  addRootExtraCss(value: ICssRenderer) {
    this.rootExtraCss.push(value);
  }

  getRootExtraCss(theme: ITheme) {
    return this.rootExtraCss.map((v) => v(theme)).join('\n\n');
  }
}
