import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconWithSkewerStore } from './IconWithSkewer.store';
import { SimpleIconWithSkewerComponent } from './SimpleIconWithSkewer.cmp';

export class SimpleIconWithSkewerStore extends IconWithSkewerStore {
  initShape(): void {
    super.initShape();
    this.shape.setSize({
      leftSize: () => Math.max(
        this.block.shape.leftSize,
        this.skewer.shape.leftSize,
      ),
      rightSize: () => Math.max(
        this.block.shape.leftSize,
        this.skewer.shape.rightSize,
      ),
      height: () => this.block.shape.height + this.skewer.shape.height,
    });

    this.block.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });

    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height,
    })
  }

  getRenderer(): TIconRenderer<any> {
    return SimpleIconWithSkewerComponent;
  }
}