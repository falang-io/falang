import { computed, makeObservable } from 'mobx';
import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';
import { IconWithThreadsCommonStore } from '../../threads/icon-with-threads-common.store.js';
import type { IIconWithThreadsParams } from '../../threads/icon-with-threads.store.js';

export class MindTreeBodyIconStore extends IconWithThreadsCommonStore {
  constructor(params: IIconWithThreadsParams) {
    super({
      ...params,
      threads: {
        ...params.threads,
        disableOutlines: true,
      },
    });
    makeObservable(this);
  }

  resetShape() {
    super.resetShape();
    this.threads.setPosition({
      x: () => 0,
      y: () => this.y + this.blockFullHeight + CELL_SIZE_2,
    });
    this.setShapePosition({
      dx: () => this.centerX,
      dy: () => 0,
    });
  }

  @computed get leftX(): number {
    const leftIcon = this.threads.icons[0];
    if (!leftIcon) return 0;
    return leftIcon.x;
  }

  @computed get rightX(): number {
    const rightIcon = this.threads.icons.at(-1);
    if (!rightIcon) return 0;
    return rightIcon.x;
  }

  @computed get centerX(): number {
    return Math.round((this.leftX + (this.rightX - this.leftX) / 2) / CELL_SIZE) * CELL_SIZE;
  }
}
