import { computed, makeObservable } from 'mobx';
import type { IIconWithThreadsParams } from '../../threads/icon-with-threads.store.js';
import { IconWithThreadsStore } from '../../threads/icon-with-threads.store.js';
import { CELL_HALF, CELL_SIZE } from '../../constants.js';

export class SwitchIconStore extends IconWithThreadsStore {
  constructor(params: IIconWithThreadsParams) {
    super(params);
    makeObservable(this);
  }

  /**
   * @TODO
   */
  // oxlint-disable-next-line typescript/class-literal-property-style
  get isShortRightBranch() {
    return false;
  }

  resetShape(): void {
    super.resetShape();
    this.threads.minimalSecondDx = () => this.blockFullRight + CELL_SIZE;
    this.threads.setPosition({
      x: () => this.x,
      y: () => this.y + this.blockFullHeight + CELL_SIZE,
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
    return this.threads.height + this.blockFullHeight + CELL_SIZE;
  }
}
