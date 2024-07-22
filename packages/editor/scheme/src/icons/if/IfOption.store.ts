import { CELL_SIZE } from '../../common/constants';
import { SimpleIconWithSkewerStore } from '../../common/skewer/SimpleIconWithSkewer.store';
import { SingleThreadIconStore } from '../../common/threads/SignleThreadIcon.store';

export class IfOptionStore extends SimpleIconWithSkewerStore {
  initShape(): void {
    super.initShape();
    this.block.position.setPosition({
      x: 0,
      y: 0,
    });
    this.block.shape.setSize({
      height: 0,
      leftSize: 0,
      rightSize: 0,
    })
    this.shape.setSize({
      height: () =>
        + this.block.shape.height
        + this.skewer.shape.height,
      leftSize: () => Math.max(
        this.block.shape.leftSize,
        this.skewer.shape.leftSize,
      ),
      rightSize: () => Math.max(
        this.block.shape.rightSize,
        this.skewer.shape.rightSize,
      ),
    });
    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height,
    })
  }
}