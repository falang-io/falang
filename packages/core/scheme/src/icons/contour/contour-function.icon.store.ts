import { computed, makeObservable } from 'mobx';
import type { IIconStoreWithFixedChildren } from '../../checker.js';
import { checker } from '../../checker.js';
import type { IIconStoreParams } from '../../store/icon.store.js';
import { IconStore } from '../../store/icon.store.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';
import type { IVerticalLine } from '../../types/vertical-line.js';
import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';
import type { ContourBodyStore } from './contour-body.store.js';
import type { IconWithThreadsStore } from '../../threads/icon-with-threads.store.js';
import type { IIconOutLine } from '../../types/icon-outline.js';
import type { FunctionBodyIconStore } from '../function/function-body.icon.store.js';
import { calculateContourFunctionReturnLines } from './calculate-contour-function-return-lines.js';

export class ContourFunctionIconStore extends IconStore implements IIconStoreWithFixedChildren {
  private _children: IconStore[] | null = null;

  constructor(params: IIconStoreParams) {
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
    return this.y + (this.body?.height ?? 0) + this.blockFullHeight;
  }

  get children(): readonly IconStore[] {
    return this._children ?? [];
  }

  setChildren(icons: IconStore[]) {
    if (this._children) throw new Error('Children already set');
    this._children = icons;
  }

  private getAtIndexOrFail(index: number) {
    const icon = this.children.at(index);
    if (!icon) throw new Error(`Icon not found at index ${index}`);
    return icon;
  }

  get body() {
    return this.getAtIndexOrFail(0) as FunctionBodyIconStore;
  }

  get footer() {
    return this.getAtIndexOrFail(1) as IconWithThreadsStore;
  }

  resetShape(): void {
    super.resetShape();
    this.body.setPosition({
      x: () => this.x,
      y: () => this.y + this.blockFullHeight,
    });
    this.footer.setPosition({
      x: () => this.x,
      y: () => {
        const parent = this.parent as ContourBodyStore;

        return (
          this.y + parent.heightWithoutFooters + parent.maxFunctionsFooterHeight - this.footer.height - CELL_SIZE_2
        );
      },
    });
  }

  get left(): number {
    return Math.max(this.blockFullLeft, this.body.left, this.footer.left);
  }
  get right(): number {
    return Math.max(this.blockFullRight, this.body.right, this.footer.right);
  }
  get height(): number {
    return this.blockFullHeight + this.body.height + this.footer.height + CELL_SIZE_2 + this.extraHeight;
  }

  @computed get heightWithoutFooter(): number {
    return this.blockFullHeight + this.body.height + CELL_SIZE_2 + this.extraHeight;
  }

  @computed get filteredOutLines(): IIconOutLine[] {
    return this.body.skewer.outLines
      .filter((outline) => outline.type === 'return' || outline.type === 'main')
      .toSorted((a, b) => a.x - b.x);
  }

  @computed get differentReturnsCount() {
    const returnsSet = new Set<number>();
    this.filteredOutLines.filter((ol) => ol.type === 'return').forEach((ol) => returnsSet.add(ol.level));
    return returnsSet.size;
  }

  @computed get extraHeight() {
    return this.differentReturnsCount * CELL_SIZE;
  }

  @computed get parentHeight() {
    const parent = this.parent;
    if (!checker.isWithThreads(parent)) return 0;
    return parent.threads.iconsMaxHeight;
  }

  @computed get returnLines() {
    return calculateContourFunctionReturnLines(this);
  }
}
