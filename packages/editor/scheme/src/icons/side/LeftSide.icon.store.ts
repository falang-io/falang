import { CELL_SIZE } from '../../common/constants';
import { IconStore, IIconParams } from '../base/Icon.store';

export interface ILeftSideIconParams extends IIconParams {
  blockLeftGap?: number
  blockRightGap?: number
  blockTopDy?: number
}

export class LeftSideIconStore extends IconStore {
  readonly blockLeftGap: number;
  readonly blockRightGap: number;
  readonly blockTopDy: number;

  constructor(params: ILeftSideIconParams) {
    super(params);
    this.blockLeftGap = params.blockLeftGap ?? 0;
    this.blockRightGap = params.blockRightGap ?? CELL_SIZE;
    this.blockTopDy = params.blockTopDy ?? -CELL_SIZE;
  }

  initShape(): void {
    super.initShape();
    this.shape.setSize({
      leftSize: () => this.block.width + this.blockLeftGap + this.blockRightGap + CELL_SIZE,
      rightSize: 0,
      height: () => this.block.shape.height,
    });
    this.block.position.setPosition({
      x: () => this.position.x - this.blockRightGap - this.block.width - CELL_SIZE,
      y: () => this.position.y + this.blockTopDy,
    });
  }
}