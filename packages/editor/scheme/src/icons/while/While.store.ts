import { computed, makeObservable, observable } from 'mobx';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { IIconWithSkewerStoreParams } from '../../common/skewer/IconWithSkewer.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { CycleIconStore } from '../cycle/Cycle.icon.store';
import { WhileComponent } from './While.cmp';

export interface IWhileIconStoreParams extends IIconWithSkewerStoreParams {
  trueIsMain?: boolean
}

export class WhileStore extends CycleIconStore {
  @observable trueIsMain: boolean;

  constructor(params: IWhileIconStoreParams) {
    super(params);
    this.trueIsMain = !!params.trueIsMain
    makeObservable(this);
    this.block.resizeBarGap = CELL_SIZE;
  }

  @computed get rectPolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y + this.skewer.shape.height;
    const h = this.block.shape.height;

    const x1 = x - this.block.shape.leftSize - CELL_SIZE;
    const x2 = x - this.block.shape.leftSize;
    const x3 = x + this.block.shape.rightSize;
    const x4 = x + this.block.shape.rightSize + CELL_SIZE;

    const y1 = y;
    const y2 = y + Math.round(h / 2);
    const y3 = y + h;

    const points: number[][] = [
      [x1, y2],
      [x2, y1],
      [x3, y1],
      [x4, y2],
      [x3, y3],
      [x2, y3],
      [x1, y2],
    ];

    return points.map(p => p.join(',')).join(' ');
  }

  initShape(): void {
    super.initShape();
    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y + this.skewer.shape.height,
    });
    this.shape.setSize({
      leftSize: () => Math.max(
        this.block.shape.leftSize + CELL_SIZE,
        this.skewer.shape.leftSize,
      ) + CELL_SIZE,
      rightSize: () => Math.max(
        this.block.shape.rightSize + CELL_SIZE,
        this.skewer.shape.rightSize,
      )/* + (this.hasContinue ? CELL_SIZE : 0)*/,
      height: () => this.skewer.shape.height + this.block.shape.height + (this.hasBreak ? CELL_SIZE : 0), 
    });
  }

  get arrowBottomGap(): number {
    return this.block.shape.rightSize + this.block.resizeBarGap;
  }

  get skewerDy(): number {
    return CELL_HALF;
  }

  protected getArrowBottomY(): number {
    return this.position.y + this.skewer.shape.height + this.block.halfHeight;
    //return super.getArrowBottomY() - CELL_HALF - Math.round(this.block.shape.height / 2);
  }

  protected getArrowBottomX(): number {
    return this.position.x - this.block.shape.rightSize - this.block.resizeBarGap;
  }

  protected getBreakArrowX(): number {
    return this.position.x;
  }

  protected getArrowTopY(): number {
    return this.position.y;
  }

  protected getBreakArrowY(): number {
    return this.position.y + this.skewer.shape.height + this.block.shape.height + CELL_SIZE;
  }

  getRenderer(): TIconRenderer<any> {
    return WhileComponent;
  }
}