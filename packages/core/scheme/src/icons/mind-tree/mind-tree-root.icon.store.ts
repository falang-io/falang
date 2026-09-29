import { computed, makeObservable } from 'mobx';
import { IconStore } from '../../store/icon.store.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';
import type { IIconStoreWithFixedChildren } from '../../checker.js';
import { getIconAtIndexOrFail } from '../../utils/get-icon-at-index-or-fail.js';
import type { SimpleIconStore } from '../simple/simple.icon.js';
import type { MindTreeThreadIconStore } from './mind-tree-thread.icon.store.js';
import { CELL_SIZE } from '../../constants.js';
import type { MindTreeBodyIconStore } from './mind-tree-body.icon.store.js';

export class MindTreeRootIconStore extends IconStore implements IIconStoreWithFixedChildren {
  private _children: IconStore[] | null = null;

  constructor(params: ConstructorParameters<typeof IconStore>[0]) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.WithChildren, IconFlags.WithFixedChildren, IconFlags.Contour),
    });
    makeObservable(this);
  }

  get children() {
    return this._children || [];
  }

  setChildren(icons: IconStore[]) {
    if (this._children) throw new Error('Children already set');
    this._children = icons;
  }

  resetShape() {
    super.resetShape();
    this.header.setPosition({
      x: () => this.body.centerX,
      y: () => this.y,
    });
    this.body.setPosition({
      x: () => 0,
      y: () => this.y + this.header.height + CELL_SIZE,
    });
  }

  get header() {
    return getIconAtIndexOrFail<SimpleIconStore>(this, 0);
  }

  get body() {
    return getIconAtIndexOrFail<MindTreeBodyIconStore>(this, 1);
  }

  get threads() {
    return this.body.threads.icons as MindTreeThreadIconStore[];
  }

  readonly left = 0;
  @computed get right(): number {
    return Math.max(this.blockFullLeft + this.blockFullRight, CELL_SIZE + this.body.right);
  }
  @computed get height(): number {
    return this.blockFullHeight + this.body.height + CELL_SIZE + this.header.height + CELL_SIZE;
  }
}
