import { computed, makeObservable, runInAction } from 'mobx';
import { CELL_SIZE } from '../../common/constants';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IIconParams } from '../base/Icon.store';
import { LeftSideIconStore } from './LeftSide.icon.store';
import { TimingSideIconComponent } from './TimingSideIcon.cmp';

export class TimerSideIconStore extends LeftSideIconStore {
  constructor(params: IIconParams) {
    super({
      ...params,
      blockLeftGap: CELL_SIZE,
      blockRightGap: CELL_SIZE,
    });
    makeObservable(this);
    runInAction(() => {
      this.block.width = CELL_SIZE * 2
    });    
  }

  @computed get rectPolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y;
    const height = this.block.shape.height;

    const x1 = x - CELL_SIZE * 5;
    const x2 = x - CELL_SIZE * 4;
    const x3 = x - CELL_SIZE * 2;
    const x4 = x - CELL_SIZE;

    const y1 = y - CELL_SIZE;
    const y2 = y + height - CELL_SIZE;

    const points: number[][] = [
      [x1, y1],
      [x4, y1],
      [x3, y2],
      [x2, y2],
      [x1, y1],
    ];

    return points.map(p => p.join(',')).join(' ');
  }

  getRenderer(): TIconRenderer<any> {
    return TimingSideIconComponent;
  }
}