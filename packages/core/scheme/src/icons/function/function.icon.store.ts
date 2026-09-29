import { computed, makeObservable } from 'mobx';
import type { IVerticalLine } from '../../types/vertical-line.js';
import { CELL_SIZE } from '../../constants.js';
import { IconStore } from '../../store/icon.store.js';
import type { IIconStoreWithFixedChildren } from '../../checker.js';
import { checker } from '../../checker.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';

export class FunctionIconStore extends IconStore implements IIconStoreWithFixedChildren {
  private _children: IconStore[] | null = null;

  constructor(params: ConstructorParameters<typeof IconStore>[0]) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.WithChildren, IconFlags.WithFixedChildren),
    });
    makeObservable(this);
  }

  @computed get returnConnectLines(): IVerticalLine[] {
    const returnValue: IVerticalLine[] = [];
    const body = this.body;
    if (checker.isFunctionBody(body)) {
      const y = this.returnLineBottomY;
      body.myIconOutlines.forEach((outline) => {
        returnValue.push({
          x: outline.x,
          y1: outline.y,
          y2: y,
          targetId: outline.targetId,
          type: outline.type,
        });
      });
    }
    return returnValue;
  }

  @computed get returnLineBottomY(): number {
    return this.getReturnLineBottomY();
  }

  protected getReturnLineBottomY(): number {
    return (
      this.y +
      (this.body?.height ?? 0) +
      (this.header?.height ?? 0) +
      Math.round((this.footer?.height ?? 0) / 2) +
      this.blockFullHeight
    );
  }

  get children(): readonly IconStore[] {
    return this._children ?? [];
  }

  setChildren(icons: IconStore[]) {
    if (this._children) throw new Error('Children already set');
    this._children = icons;
  }

  get header() {
    return this.children?.at(0);
  }

  get body() {
    return this.children?.at(1);
  }

  get footer() {
    return this.children?.at(2);
  }

  resetShape(): void {
    super.resetShape();
    this.header?.setPosition({
      x: () => this.x,
      y: () => this.y,
    });
    this.body?.setPosition({
      x: () => this.x,
      y: () => this.y + (this.header?.height ?? 0) + CELL_SIZE,
    });
    this.footer?.setPosition({
      x: () => this.x,
      y: () => this.y + (this.header?.height ?? 0) + (this.body?.height ?? 0) + CELL_SIZE,
    });
  }

  @computed get left(): number {
    const body = this.body;
    return Math.max(
      this.header?.left ?? 0,
      this.blockFullLeft,
      checker.isFunctionBody(body) ? body.skewer.left : 0,
      this.footer?.left ?? 0,
    );
  }
  @computed get right(): number {
    const body = this.body;
    return Math.max(
      this.header?.right ?? 0,
      this.blockFullRight,
      checker.isFunctionBody(body) ? body.skewer.right : 0,
      this.footer?.right ?? 0,
    );
  }
  @computed get height(): number {
    return (this.header?.height ?? 0) + this.blockFullHeight + (this.body?.height ?? 0) + (this.footer?.height ?? 0);
  }
  /*protected getOutsIds(): string[] {
    const outsIds = this.outsIds;
    return outsIds.filter((outId) => {
      const icon = this.registry.get(outId) as OutStore;
      if (icon.type === 'return') return false;
      return true;
    });
  }*/
}
