import { computed, makeObservable } from 'mobx';
import type { CycleIconParams } from '../cycle/cycle.icon.store.js';
import { CycleIconStore } from '../cycle/cycle.icon.store.js';
import { CELL_SIZE } from '../../constants.js';
import type { INodeMeta } from '@falang/dto';
import { addFlag, IconFlags } from '../../types/icon-flags.js';

export class WhileIconStore extends CycleIconStore {
  constructor(params: CycleIconParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.While),
    });
    makeObservable(this);
  }

  /**
   * `true` means true leads down the main path (loop exit, compiled as `while (!(cond))`); the
   * default, `false`, means true repeats the loop (`while (cond)`). Read directly off `dataNode.meta`
   * (an `@observable.ref` on `NodeStore`) rather than cached in the constructor, so a `setMeta` call
   * re-renders this icon instead of leaving it stale.
   */
  @computed get trueIsMain(): boolean {
    return this.dataNode.meta.trueIsMain === true;
  }

  getMeta(): INodeMeta {
    return { ...super.getMeta(), trueIsMain: this.trueIsMain };
  }

  get arrowBottomGap(): number {
    return this.blockFullRight;
  }

  protected getArrowBottomY(): number {
    return this.y + this.skewer.height + Math.round(this.blockFullHeight / 2);
    //return super.getArrowBottomY() - CELL_HALF - Math.round(this.block.height / 2);
  }

  protected getArrowBottomX(): number {
    return this.x - this.blockFullLeft;
  }

  protected getBreakArrowX(): number {
    return this.x;
  }

  protected getArrowTopY(): number {
    return this.y;
  }

  protected getBreakArrowY(): number {
    return this.y + this.skewer.height + this.blockFullHeight + CELL_SIZE;
  }

  @computed get left(): number {
    return Math.max(Math.round(this.blockWidth / 2) + CELL_SIZE * 2, this.skewer.left + CELL_SIZE) + this.modsLeft;
  }
  @computed get right(): number {
    return Math.max(Math.round(this.blockWidth / 2) + CELL_SIZE, this.skewer.right) + this.modsRight;
  }
  @computed get height(): number {
    return this.skewer.height + this.blockFullHeight + (this.hasBreak ? CELL_SIZE : 0);
  }

  resetShape(): void {
    super.resetShape();
    this.skewer.setPosition({
      x: () => this.x,
      y: () => this.y,
    });
    this.setShapePosition({
      dx: () => 0,
      dy: () => this.skewer.height,
    });
    this.skewer.resetShape();
  }
}
