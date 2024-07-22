import { computed } from 'mobx';
import { CELL_SIZE } from '../../common/constants';
import { SingleThreadIconStore } from '../../common/threads/SignleThreadIcon.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { SwitchOptionComponent } from './SwitchOption.cmp';

export class SwitchOptionStore extends SingleThreadIconStore {
  initShape(): void {
    super.initShape();
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y,
    });
    this.shape.setSize({
      height: () => this.block.shape.height + this.skewer.shape.height + CELL_SIZE,
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
      y: () => this.position.y + this.block.shape.height + CELL_SIZE,
    })
  }

  @computed get trianglePolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y + this.block.shape.height;

    return [
      [x + this.block.shape.rightSize, y],
      [x, y + CELL_SIZE],
      [x - this.block.shape.leftSize, y],
    ].map(p => p.join(',')).join(' ');
  }

  getRenderer(): TIconRenderer<any> {
    return SwitchOptionComponent;
  }
}