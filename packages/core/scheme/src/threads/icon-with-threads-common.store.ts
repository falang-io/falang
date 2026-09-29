import { computed, makeObservable } from 'mobx';
import type { IIconWithThreadsParams } from './icon-with-threads.store.js';
import { IconWithThreadsStore } from './icon-with-threads.store.js';
import { CELL_HALF, CELL_SIZE } from '../constants.js';

export class IconWithThreadsCommonStore extends IconWithThreadsStore {
  constructor(params: IIconWithThreadsParams) {
    super(params);
    makeObservable(this);
  }

  resetShape(): void {
    super.resetShape();
    this.threads.setPosition({
      x: () => this.x,
      y: () => this.y + this.blockFullHeight + (this.blockFullHeight > 0 ? CELL_SIZE : 0),
    });
    this.threads.resetShape();
    this.threads.valencePointY = () => this.y + this.blockFullHeight + CELL_HALF;
  }

  @computed get left(): number {
    return Math.max(this.threads.left, this.blockFullLeft);
  }

  @computed get right(): number {
    return Math.max(this.threads.right, this.blockFullRight);
  }

  @computed get height(): number {
    return this.threads.height + this.blockFullHeight + (this.blockFullHeight > 0 ? CELL_SIZE : 0);
  }
}
