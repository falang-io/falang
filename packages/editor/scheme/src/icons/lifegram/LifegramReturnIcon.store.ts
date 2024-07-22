import { computed, makeObservable } from 'mobx';
import { CELL_SIZE } from '../../common/constants';
import { SingleThreadIconStore } from '../../common/threads/SignleThreadIcon.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IIconParams } from '../base/Icon.store';
import { LifeGramReturnIconComponent } from './LifeGramReturnIcon.cmp';

export class LifegramReturnIconStore extends SingleThreadIconStore {
  constructor(params: IIconParams) {
    super({
      ...params,
      children: [],
    });
    makeObservable(this);
  }

  initShape() {
    super.initShape();
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y + CELL_SIZE * 2,
    });
    this.shape.setSize({
      leftSize: () => this.block.shape.leftSize,
      rightSize: () => this.block.shape.rightSize,
      height: () => this.block.shape.height + CELL_SIZE * 3,
    });
  }

  @computed get trianglePolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y + CELL_SIZE;

    return [
      [x + this.block.shape.leftSize, y + CELL_SIZE],
      [x, y],
      [x - this.block.shape.rightSize, y + CELL_SIZE],
    ].map(p => p.join(',')).join(' ');
  }

  getRenderer(): TIconRenderer<any> {
    return LifeGramReturnIconComponent;
  }

}