import { computed, makeObservable } from 'mobx';
import type { IIconStoreParams } from '../store/icon.store.js';
import type { ISkewerBaseParams } from './skewer.store.js';

import { IconWithSkewerStore } from './icon-with-skewer.store.js';

export interface IIconWithSkewerStoreParams extends IIconStoreParams {
  skewer?: ISkewerBaseParams;
}

export class IconWithSkewerCommonStore extends IconWithSkewerStore {
  constructor(params: IIconWithSkewerStoreParams) {
    super(params);
    makeObservable(this);
  }

  @computed get left(): number {
    return Math.max(this.skewer.left, this.blockFullLeft);
  }

  @computed get right(): number {
    return Math.max(this.skewer.right, this.blockFullRight);
  }

  @computed get height(): number {
    return this.skewer.height + this.blockFullHeight;
  }

  resetShape() {
    super.resetShape();
    this.skewer.setPosition({
      x: () => this.x,
      y: () => this.y + this.blockFullHeight,
    });
    this.skewer.resetShape();
  }
}
