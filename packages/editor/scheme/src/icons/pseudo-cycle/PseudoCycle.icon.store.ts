import { computed, makeObservable } from 'mobx';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { IIconWithSkewerStoreParams } from '../../common/skewer/IconWithSkewer.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { CycleIconStore } from '../cycle/Cycle.icon.store';
import { PseudoCycleIconComponent } from './PseudoCycle.icon.cmp';

export class PseudoCycleIconStore extends CycleIconStore {

  constructor(params: IIconWithSkewerStoreParams) {
    super({
      ...params,
      hideBackArrow: true,
    });
    makeObservable(this);
  }

  initShape(): void {
    super.initShape();
    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height,
    });
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y,
    });
    this.block.shape.setSize({
      leftSize: CELL_SIZE * 3,
      rightSize: CELL_SIZE * 3,
      height: () => this.scheme.isEditing ? CELL_SIZE : 0,
    });
    this.shape.setSize({
      leftSize: () => Math.max(
        this.block.shape.leftSize + CELL_SIZE,
        this.skewer.shape.leftSize,
      ) + CELL_SIZE,
      rightSize: () => Math.max(
        this.block.shape.rightSize,
        this.skewer.shape.rightSize,
      )/* + (this.hasContinue ? CELL_SIZE : 0)*/,
      height: () => this.skewer.shape.height + this.block.shape.height, 
    });
  }

  get arrowBottomGap(): number {
    return this.block.shape.rightSize + this.block.resizeBarGap;
  }

  get skewerDy(): number {
    return CELL_HALF;
  }

  protected getArrowBottomY(): number {
    return this.position.y + this.skewer.shape.height + this.block.shape.height;
    //return super.getArrowBottomY() - CELL_HALF - Math.round(this.block.shape.height / 2);
  }

  protected getArrowBottomX(): number {
    return this.position.x;
  }

  getContinueLineLastY(): number {
    return this.position.y + (this.scheme.isEditing ? CELL_HALF : 0);
  }

  get continueLineLastX(): number {
    return this.position.x + (this.scheme.isEditing ? CELL_SIZE * 3 : 0);
  }



  protected getBreakArrowX(): number {
    return this.position.x;
  }

  protected getArrowTopY(): number {
    return this.position.y + (this.scheme.isEditing ? CELL_HALF : 0);
  }

  protected getBreakArrowY(): number {
    return this.position.y + this.skewer.shape.height + this.block.shape.height;
  }

  getRenderer(): TIconRenderer<any> {
    return PseudoCycleIconComponent;
  }
}