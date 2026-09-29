import { computed } from 'mobx';
import { CELL_HALF, CELL_SIZE } from '../../constants.js';
import type { IIconWithThreadsParams } from '../../threads/icon-with-threads.store.js';
import { IconWithThreadsStore } from '../../threads/icon-with-threads.store.js';

export class ContourFunctionFooterIconStore extends IconWithThreadsStore {
  constructor(params: IIconWithThreadsParams) {
    super({
      ...params,
      threads: {
        ...params.threads,
        verticalAlign: 'bottom',
      },
    });
  }

  resetShape(): void {
    super.resetShape();
    this.threads.setPosition({
      x: () => this.x,
      y: () => this.y,
    });
    this.threads.resetShape();
    this.threads.valencePointY = () => this.threads.y + this.threads.height + CELL_HALF;
    this.threads.gapControlsY = () => this.threads.y + this.threads.height - CELL_SIZE * 3;
  }

  @computed get left(): number {
    return this.threads.left;
  }

  @computed get right(): number {
    return this.threads.right;
  }

  @computed get height(): number {
    return this.threads.iconsMaxHeight;
  }
}
