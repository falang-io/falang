import { computed, makeObservable } from 'mobx';
import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';
import type { IIconWithSkewerStoreParams } from '../../skewer/icon-with-skewer.store.js';
import { IconWithSkewerStore } from '../../skewer/icon-with-skewer.store.js';
import { checker } from '../../checker.js';

export class MindTreeThreadIconStore extends IconWithSkewerStore {
  constructor(params: IIconWithSkewerStoreParams) {
    super({
      ...params,
      skewer: {
        ...params.skewer,
        hideEnds: true,
      },
    });
    makeObservable(this);
  }

  resetShape() {
    super.resetShape();
    this.skewer.setPosition({
      x: () => this.x + CELL_SIZE - this.blockFullLeft,
      y: () => this.y + this.blockFullHeight,
    });
    this.skewer.resetShape();
  }

  readonly left = 0;
  @computed get right() {
    return Math.max(this.blockFullLeft, CELL_SIZE_2 + this.skewer.right);
  }
  @computed get height() {
    return this.blockFullHeight + this.skewer.height + CELL_SIZE;
  }

  @computed get isLast(): boolean {
    const parent = this.parent;
    if (!checker.isWithList(parent)) return false;
    return parent.list.iconsIds.indexOf(this.id) === parent.list.iconsIds.length - 1;
  }
}
