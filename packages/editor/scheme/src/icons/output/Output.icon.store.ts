import { computed } from 'mobx';
import { CELL_SIZE, CELL_SIZE_2 } from '../../common/constants';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconStore } from '../base/Icon.store';
import { OutputIconComponent } from './Output.icon.cmp';

export class OutputIconStore extends IconStore {
  initShape(): void {
    super.initShape();
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y + CELL_SIZE,
    });
    this.shape.setSize({
      leftSize: () => this.block.shape.leftSize + this.leftSideStoreExtraSize,
      rightSize: () => this.block.shape.rightSize + CELL_SIZE_2,
      height: () => this.block.shape.height + CELL_SIZE,
    });
  }

  getRenderer(): TIconRenderer<any> {
    return OutputIconComponent;
  }

  @computed get polylinePoints() {
    const x = this.position.x;
    const y = this.position.y;
    const h = this.block.shape.height;

    const x1 = x - this.block.shape.leftSize + CELL_SIZE;
    const x2 = x + this.block.shape.rightSize + CELL_SIZE;
    const x3 = x + this.block.shape.rightSize + CELL_SIZE_2;

    const y1 = y;
    const y2 = y + Math.round(h / 2);
    const y3 = y + h;

    const points: number[][] = [
      [x1, y1],
      [x2, y1],
      [x3, y2],
      [x2, y3],
      [x1, y3],
      [x1, y1],
    ];

    return points.map(p => p.join(',')).join(' ');
  }
}
