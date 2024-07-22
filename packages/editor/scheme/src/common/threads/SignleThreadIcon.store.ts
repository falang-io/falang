import { computed, makeObservable, observable } from 'mobx';
import { CELL_SIZE } from '../constants';
import { IconWithSkewerStore, IIconWithSkewerStoreParams } from '../skewer/IconWithSkewer.store';

export interface ISingleThreadIconParams extends IIconWithSkewerStoreParams {}

export class SingleThreadIconStore extends IconWithSkewerStore {

  constructor(params: ISingleThreadIconParams) {
    super(params);
    makeObservable(this);
  }

  initShape() {
    super.initShape();
    this.shape.setSize({
      leftSize: () => Math.max(
        this.skewer.shape.leftSize,
        this.skewer.outStore?.shape.leftSize ?? 0,
        this.block.shape.leftSize,
      ),
      rightSize: () => Math.max(
        this.skewer.shape.rightSize,
        this.skewer.outStore?.shape.rightSize ?? 0,
        this.block.shape.rightSize,
      ),
      height: () => {
        return this.skewer.shape.height + this.block.shape.height + this.skewer.outIconHeight;
      }
    });
  }
}