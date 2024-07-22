import { computed, makeObservable, observable } from 'mobx';
import { BlockStore } from '../../common/blocks/store/BlocksStore';
import { EmptyBlockStore } from '../../common/blocks/store/EmptyBlockStore';
import { CELL_HALF, CELL_SIZE, THREADS_MARGIN } from '../../common/constants';
import { IHorisonatalLine, IVericalLine } from '../../common/ILine';
import { IconWithSkewerStore } from '../../common/skewer/IconWithSkewer.store';
import { IThreadsIconParams, ThreadsIconStore } from '../../common/threads/ThreadsIconStore';
import { IconStore, IIconParams } from '../base/Icon.store';
import { IIconOutLine } from '../../common/outs/TOutType';
import { SingleThreadIconStore } from '../../common/threads/SignleThreadIcon.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IfOptionStore } from './IfOption.store';
import { SimpleIconWithSkewerComponent } from '../../common/skewer/SimpleIconWithSkewer.cmp';
import { IfIconComponent } from '../if/If.icon.cmp';

export const IFICON_POLYLINE_GAP = CELL_SIZE;

export interface IIfIconStoreParams extends IThreadsIconParams {
  trueOnRight: boolean,
}

export class IfIconStore extends ThreadsIconStore<IfOptionStore> {
  @observable trueOnRight = false;

  constructor({ trueOnRight, ...params }: IIfIconStoreParams) {
    super({
      ...params,
      editable: false,      
    });
    this.trueOnRight = trueOnRight;
    this.block.resizeBarGap = CELL_SIZE;
    makeObservable(this);
  }

  /**
   * @deprecated
   */
  @computed get trueBranch() {
    return this.trueOnRight ? this.threads.icons[1] : this.threads.icons[0];
  }

  /**
   * @deprecated
   */
  @computed get falseBranch() {
    return this.trueOnRight ? this.threads.icons[0] : this.threads.icons[1];
  }

  protected getMinimalSecondDx(): number {
    return this.block.shape.rightSize + IFICON_POLYLINE_GAP + CELL_SIZE;
  }

  protected getIconOutLines(): IIconOutLine[] {
    const iconOutlines = this.threads.getIconOutLines();
    if(!iconOutlines.length) return [];
    if(this.isShortRightBranch) {
      const lastOutline = {
        ...iconOutlines[iconOutlines.length - 1],
      };
      lastOutline.y = this.position.y + this.block.shape.halfHeight;
      iconOutlines[iconOutlines.length - 1] = lastOutline;
    }
    return iconOutlines;
  }

  @computed get isShortRightBranch(): boolean {
    return this.threads.icons[1].skewer.icons.length === 0 && !!this.threads.icons[1].skewer.outStore && !this.scheme.isEditing && !this.threads.icons[1].skewer.outStore.isBlockShape;
  }

  @computed get rightBranchX() {
    return this.threads.icons[1]?.position.x ?? 0;
  }

  /**
   * @deprecated
   */
  @computed get xBetweenBranches(): number {
    const leftRightSize = this.trueOnRight ? this.falseBranch.shape.rightSize : this.trueBranch.shape.rightSize;
    const rightLeftSize = this.trueOnRight ? this.trueBranch.shape.leftSize : this.falseBranch.shape.leftSize;
    const blockRightSize = this.block.shape.rightSize + CELL_SIZE;
    return  Math.max(leftRightSize + rightLeftSize, blockRightSize) + CELL_SIZE;
  }

  initShape(): void {
    this.threads.minimalSecondDx = () => this.block.shape.rightSize + CELL_SIZE * 2;        
    super.initShape();
    this.shape.setSize({
      leftSize: () =>
        Math.max(
          this.block.shape.leftSize + CELL_SIZE + this.leftSideStoreExtraSize,
          this.threads.shape.leftSize
        ),
      rightSize: () => {
        return Math.max(
          this.block.shape.rightSize + CELL_SIZE,
          this.threads.shape.rightSize,
        )
      },
      height: () =>
        this.block.shape.height +
        this.threads.shape.height
    });
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y,
    });
    this.threads.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height,
    });
    this.threads.gapControlsY = () => this.position.y + this.block.shape.height + CELL_SIZE;
  }

  @computed get rectPolylinePoints() {
    const x = this.position.x;
    const y = this.position.y;
    const h = this.block.shape.height;

    const x1 = x - this.block.shape.leftSize - IFICON_POLYLINE_GAP;
    const x2 = x - this.block.shape.leftSize;
    const x3 = x + this.block.shape.rightSize;
    const x4 = x + this.block.shape.rightSize + IFICON_POLYLINE_GAP;

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

  getRenderer(): TIconRenderer<any> {
    return IfIconComponent;
  }
}
