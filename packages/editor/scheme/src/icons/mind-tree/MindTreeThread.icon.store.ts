import { CELL_SIZE } from '../../common/constants';
import { IconWithSkewerStore, IIconWithSkewerStoreParams } from '../../common/skewer/IconWithSkewer.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { MindTreeThreadIconComponent } from './MindTreeThread.icon.cmp';

export interface IMindTreeThreadIconStore extends IIconWithSkewerStoreParams {
}

export class MindTreeThreadIconStore extends IconWithSkewerStore {

  constructor(params: IMindTreeThreadIconStore) {
    super({
      ...params,
      hideEnds: true,
    });
  }

  initShape(): void {
    super.initShape();
    this.block.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + CELL_SIZE,
    });
    this.skewer.position.setPosition({
      x: () => this.position.x + CELL_SIZE,
      y: () => this.position.y + this.block.shape.height + CELL_SIZE,
    });
    this.shape.setSize({
      leftSize: 0,
      rightSize: () => Math.max(
        this.block.shape.width,
        CELL_SIZE + this.skewer.shape.rightSize,
      ),
      height: () => this.block.shape.height + this.skewer.shape.height + CELL_SIZE,
    });
  }

  getRenderer(): TIconRenderer<any> {
    return MindTreeThreadIconComponent;
  }
}