import { computed, makeObservable } from 'mobx';
import type { IIconStoreWithFixedChildren } from '../../checker.js';
import { IconStore } from '../../store/icon.store.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';
import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';
import type { ContourBodyStore } from './contour-body.store.js';

export class ContourIconStore extends IconStore implements IIconStoreWithFixedChildren {
  private _children: IconStore[] | null = null;

  constructor(params: ConstructorParameters<typeof IconStore>[0]) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.WithChildren, IconFlags.WithFixedChildren, IconFlags.Contour),
    });
    makeObservable(this);
  }

  private getAtIndexOrFail(index: number) {
    const icon = this.children.at(index);
    if (!icon) throw new Error(`Icon not found at index ${index}`);
    return icon;
  }

  get header() {
    return this.getAtIndexOrFail(0);
  }

  get body() {
    return this.getAtIndexOrFail(1) as ContourBodyStore;
  }

  get finish() {
    return this.getAtIndexOrFail(2);
  }

  get finishFooter() {
    return this.getAtIndexOrFail(3);
  }

  get children(): readonly IconStore[] {
    return this._children ?? [];
  }

  setChildren(icons: IconStore[]) {
    if (this._children) throw new Error('Children already set');
    this._children = icons;
  }

  @computed get left(): number {
    return Math.max(this.header?.left ?? 0, (this.body?.left ?? 0) + CELL_SIZE, this.blockFullLeft);
  }
  @computed get right(): number {
    return (
      (this.body?.right ?? 0) +
      Math.max((this.finish?.left ?? 0) + (this.finish?.right ?? 0), this.finishFooter?.left ?? 0) +
      CELL_SIZE
    );
  }
  @computed get height(): number {
    return (
      this.header?.height ??
      0 + this.blockFullHeight + CELL_SIZE + Math.max(this.finish?.height ?? 0, this.body?.height ?? 0)
    );
  }

  resetShape(): void {
    super.resetShape();
    this.header.setPosition({
      x: () => this.x,
      y: () => this.y,
    });
    this.body.setPosition({
      x: () => this.x,
      y: () => this.y + this.header.height + this.blockFullHeight + CELL_SIZE,
    });
    this.finish.setPosition({
      x: () => this.x + this.body.right + CELL_SIZE + this.finishLeft,
      y: () => this.body.y + this.body.blockFullHeight + CELL_SIZE_2,
    });
    this.finishFooter.setPosition({
      x: () => this.x + this.body.right + CELL_SIZE + this.finishLeft,
      y: () => this.finish.y + this.finish.height,
    });
  }

  // oxlint-disable-next-line typescript/class-literal-property-style
  get bottomLastX() {
    return 0;
  }

  @computed private get finishLeft() {
    return Math.max(this.finish.left, this.finishFooter.left);
  }
}
