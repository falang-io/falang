import { computed, makeObservable, observable } from 'mobx';
import { BlockStore } from '../../common/blocks/store/BlocksStore';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconStore } from '../base/Icon.store';
import { CycleIconComponent } from '../cycle/Cycle.icon.cmp';
import { CycleIconParams, CycleIconStore } from '../cycle/Cycle.icon.store';
import { ForeachIconComponent } from './Foreach.icon.cmp';

export interface ForEachIconStoreParams extends CycleIconParams {  
}

const FOREACH_ICON_POLYLINE_GAP = CELL_SIZE;

export class ForEachIconStore extends CycleIconStore {
  @observable trueIsMain = false;

  constructor(params: ForEachIconStoreParams) {
    super(params);
    makeObservable(this);
    this.block.resizeBarGap = CELL_SIZE;
  }

  initShape(): void {
    super.initShape();
    this.shape.setSize({
      height: () => CELL_SIZE * 2 + this.skewer.shape.height + this.block.shape.height + (this.hasBreak ? CELL_SIZE : 0),
      leftSize: () => Math.max(
        this.block.shape.leftSize + CELL_SIZE * 2, 
        this.skewer.shape.leftSize + CELL_SIZE),
      rightSize: () => Math.max(this.block.shape.rightSize + CELL_SIZE, this.skewer.shape.rightSize),
    })
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y,
    });
    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height,
    });
  }

  get arrowBottomGap(): number {
    return this.block.shape.halfHeight;;
  }

  get skewerDy(): number {
    return CELL_HALF + this.block.shape.height;
  }

  protected getArrowBottomY(): number {
    return this.position.y + this.shape.height - CELL_SIZE - CELL_HALF - (this.hasBreak ? CELL_SIZE : 0);
  }

  protected getArrowBottomX(): number {
    return this.position.x - CELL_SIZE * 3;
  }

  get arrowTopX(): number {
    return this.position.x - Math.round(this.block.shape.leftSize) - FOREACH_ICON_POLYLINE_GAP;
  }

  protected getArrowTopY(): number {
    return this.position.y + Math.max(this.block.shape.halfHeight, CELL_SIZE + CELL_HALF);
  }

  protected getContinueLineLastX(): number {
    return this.position.x + this.block.shape.rightSize + CELL_SIZE;
  }

  protected getContinueLineLastY(): number {
    return this.getArrowTopY();
  }

  protected getBreakArrowY(): number {
    return this.position.y + this.shape.height;
  }


  @computed get rectPolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y;
    const h = this.block.shape.height;
    const halfWidth = this.block.shape.halfWidth

    const x1 = x - halfWidth - FOREACH_ICON_POLYLINE_GAP;
    const x2 = x - halfWidth;
    const x3 = x + halfWidth;
    const x4 = x + halfWidth+ FOREACH_ICON_POLYLINE_GAP;

    const y1 = y;
    const y2 = y + CELL_SIZE;
    const y3 = y + h;

    const points: number[][] = [
      [x1, y2],
      [x2, y1],
      [x3, y1],
      [x4, y2],
      [x4, y3],
      [x1, y3],
      [x1, y2],
    ];

    return points.map(p => p.join(',')).join(' ');
  }

  @computed get secondRectPolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y + this.block.shape.height + this.skewer.shape.height;
    const h = CELL_SIZE * 2;
    const halfWidth = CELL_SIZE * 3;

    const x1 = x - halfWidth;
    const x2 = x1 + FOREACH_ICON_POLYLINE_GAP;
    const x3 = x + halfWidth - FOREACH_ICON_POLYLINE_GAP;
    const x4 = x + halfWidth;

    const y1 = y;
    const y2 = y + CELL_SIZE;
    const y3 = y + h;

    const points: number[][] = [
      [x1, y1],
      [x4, y1],
      [x4, y2],
      [x3, y3],
      [x2, y3],
      [x1, y2],
      [x1, y1],
    ];

    return points.map(p => p.join(',')).join(' ');
  }

  getRenderer(): TIconRenderer<any> {
    return ForeachIconComponent;
  }
}
