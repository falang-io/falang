import { computed, makeObservable } from 'mobx';
import type { IIconStoreParams } from '../../store/icon.store.js';
import { IconStore } from '../../store/icon.store.js';
import { addFlag, IconFlags } from '../../types/icon-flags.js';
import { CELL_SIZE } from '../../constants.js';
import type { IIconWithOwnLines } from '../../types/icon-with-lines.js';
import type { ILineParams } from '../../cmp/line.js';

/**
 * A mod icon drawn beside its host (ADR 0049) — e.g. the timer. The host positions it
 * (`IconStore.resetShape`); this icon only owns the connector line from its own edge to the host block's
 * edge, at the vertical middle of the host block rounded to a cell.
 */
export class SideIconStore extends IconStore implements IIconWithOwnLines {
  constructor(params: IIconStoreParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.Side, IconFlags.WithOwnLines),
    });
    makeObservable(this);
  }

  @computed get left(): number {
    return this.blockFullLeft;
  }
  @computed get right(): number {
    return this.blockFullRight;
  }
  @computed get height(): number {
    return this.blockFullHeight;
  }

  @computed get ownLines(): ILineParams[] {
    const host = this.parent;
    const placement = this.config.mod?.placement;
    if (!host || (placement !== 'left' && placement !== 'right')) return [];
    const middle = Math.round(host.blockHeight / 2 / CELL_SIZE) * CELL_SIZE;
    const y = this.blockPosition.y + this.config.shape.paddings.top + middle;
    if (placement === 'left') {
      return [{ x1: this.blockFullRight, x2: host.x - host.blockOwnLeft - this.x, y1: y, y2: y }];
    }
    return [{ x1: -this.blockFullLeft, x2: host.x + host.blockOwnRight - this.x, y1: y, y2: y }];
  }
}
