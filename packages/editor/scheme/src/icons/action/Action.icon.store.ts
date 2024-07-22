import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconStore } from '../base/Icon.store';
import { ActionIconComponent } from './Action.icon.cmp';

export class ActionIconStore extends IconStore {
  initShape(): void {
    super.initShape();
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y,
    });
    this.shape.setSize({
      leftSize: () => this.block.shape.leftSize + this.leftSideStoreExtraSize,
      rightSize: () => this.block.shape.rightSize,
      height: () => this.block.shape.height,
    });
  }

  getRenderer(): TIconRenderer<any> {
    return ActionIconComponent;
  }
}
