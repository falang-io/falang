import { computed, makeObservable } from 'mobx';
import type { IIconWithThreadsParams } from '../../threads/icon-with-threads.store.js';
import { IconWithThreadsStore } from '../../threads/icon-with-threads.store.js';
import { CELL_SIZE } from '../../constants.js';
import type { INodeMeta } from '@falang/dto';
import { addFlag, IconFlags } from '../../types/icon-flags.js';

export class IfIconStore extends IconWithThreadsStore {
  constructor(params: IIconWithThreadsParams) {
    super({
      ...params,
      flags: addFlag(params.flags, IconFlags.If),
      threads: {
        ...params.threads,
        hideValencePoints: true,
      },
    });
    makeObservable(this);
  }

  /**
   * `true` means the true-branch is the right one (`children[1]`); the default, `false`, means the
   * true-branch goes straight down (`children[0]`) — this matches every compiler's own default (see
   * `resolveIfBranches`: `node.meta?.trueOnRight === true`). Read directly off `dataNode.meta` (an
   * `@observable.ref` on `NodeStore`) rather than cached in the constructor, so a `setMeta` call
   * re-renders this icon instead of leaving it stale.
   */
  @computed get trueOnRight(): boolean {
    return this.dataNode.meta.trueOnRight === true;
  }

  getMeta(): INodeMeta {
    return { ...super.getMeta(), trueOnRight: this.trueOnRight };
  }

  @computed get rightBranchX() {
    return this.threads.icons[1]?.x ?? 0;
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
      y: () => this.y + this.blockFullHeight,
    });
    this.threads.resetShape();
  }

  @computed get left(): number {
    return Math.max(this.threads.left, this.blockFullLeft);
  }

  @computed get right(): number {
    return Math.max(this.threads.right, this.blockFullRight);
  }

  @computed get height(): number {
    return this.threads.height + this.blockFullHeight;
  }
}
