import { computed, makeObservable } from 'mobx';
import type { CycleIconParams } from '../cycle/cycle.icon.store.js';
import { CycleIconStore } from '../cycle/cycle.icon.store.js';
import { CELL_HALF, CELL_SIZE } from '../../constants.js';

export class PseudoCycleIconStore extends CycleIconStore {
  constructor(params: CycleIconParams) {
    super({
      ...params,
      hideBackArrow: true,
    });
    makeObservable(this);
  }

  @computed get isEditing() {
    return this.blockFullHeight > 0;
  }

  get arrowBottomGap(): number {
    return Math.round(this.blockFullHeight / 2);
  }

  protected getArrowBottomY(): number {
    return this.y + this.skewer.height + this.blockFullHeight;
  }

  protected getArrowBottomX(): number {
    return this.x;
  }

  protected getContinueLineLastY(): number {
    return this.y + (this.isEditing ? CELL_HALF : 0);
  }

  /** The right edge of the "pseudo-cycle" block (not a fixed `CELL_SIZE * 3`: the block is `CELL_SIZE_4` wide). */
  protected getContinueLineLastX(): number {
    return this.x + (this.isEditing ? Math.round(this.blockWidth / 2) : 0);
  }

  protected getBreakArrowX(): number {
    return this.x;
  }

  protected getArrowTopY(): number {
    return this.y + (this.isEditing ? CELL_HALF : 0);
  }

  protected getBreakArrowY(): number {
    return this.y + this.skewer.height + this.blockFullHeight;
  }

  @computed get left(): number {
    return Math.max(Math.round(this.blockWidth / 2) + CELL_SIZE * 2, this.skewer.left + CELL_SIZE);
  }
  @computed get right(): number {
    return Math.max(Math.round(this.blockWidth / 2) + CELL_SIZE, this.skewer.right);
  }
  @computed get height(): number {
    // No `+ CELL_SIZE` for a break, unlike `while`/`foreach`: those need an extra cell to route the
    // break line around their bottom block, a pseudo-cycle has none — the break line joins the main
    // line right at the icon's own bottom edge (`getBreakArrowY`).
    return this.skewer.height + this.blockFullHeight;
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
