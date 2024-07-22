import { CELL_SIZE } from '../../common/constants';
import { SingleThreadIconStore } from '../../common/threads/SignleThreadIcon.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { ParallelThreadIconComponent } from './ParallelThreadIcon.cmp';

export class ParallelThreadIconStore extends SingleThreadIconStore {
  initShape(): void {
    super.initShape();
    this.block.shape.setSize({
      leftSize: CELL_SIZE * 2,
      rightSize: () => CELL_SIZE * 2,
      height: () => this.scheme.isEditing ? CELL_SIZE : 0,
    });
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y + CELL_SIZE,
    });
    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height,
    });
  }

  getRenderer(): TIconRenderer<any> {
    return ParallelThreadIconComponent;
  }
}