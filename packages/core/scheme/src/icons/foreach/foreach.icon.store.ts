import { computed, makeObservable } from 'mobx';
import type { CycleIconParams } from '../cycle/cycle.icon.store.js';
import { CycleIconStore } from '../cycle/cycle.icon.store.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';
import { CELL_HALF, CELL_SIZE } from '../../constants.js';

export class ForEachIconStore extends CycleIconStore {
  constructor(params: CycleIconParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.ForEach, IconFlags.List),
    });
    makeObservable(this);
  }

  get arrowBottomGap(): number {
    return Math.round(this.blockHeight / 2);
  }

  get skewerDy(): number {
    return CELL_HALF + this.blockHeight;
  }

  protected getArrowBottomY(): number {
    return this.y + this.height - CELL_SIZE - CELL_HALF - (this.hasBreak ? CELL_SIZE : 0);
  }

  protected getArrowBottomX(): number {
    return this.x - CELL_SIZE * 2 - 1;
  }

  get arrowTopX(): number {
    return this.x - this.blockFullLeft;
  }

  protected getArrowTopY(): number {
    return this.y + Math.max(Math.round(this.blockFullHeight / 2), CELL_SIZE + CELL_HALF);
  }

  protected getContinueLineLastX(): number {
    return this.x + Math.round(this.blockWidth / 2) + CELL_SIZE;
  }

  protected getContinueLineLastY(): number {
    return this.getArrowTopY();
  }

  protected getBreakArrowY(): number {
    return this.y + this.height;
  }

  @computed get left(): number {
    return Math.max(Math.round(this.blockWidth / 2) + CELL_SIZE * 2, this.skewer.left + CELL_SIZE) + this.modsLeft;
  }
  @computed get right(): number {
    return Math.max(Math.round(this.blockWidth / 2) + CELL_SIZE, this.skewer.right) + this.modsRight;
  }
  @computed get height(): number {
    return CELL_SIZE * 2 + this.skewer.height + this.blockFullHeight + (this.hasBreak ? CELL_SIZE : 0);
  }

  resetShape(): void {
    super.resetShape();
    this.skewer.setPosition({
      x: () => this.x,
      y: () => this.y + this.blockFullHeight,
    });
    this.skewer.resetShape();
  }
}
