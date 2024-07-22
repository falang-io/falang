import { computed, runInAction } from 'mobx';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { SingleThreadIconStore } from '../../common/threads/SignleThreadIcon.store';
import { IThreadsIconParams, ThreadsIconStore } from '../../common/threads/ThreadsIconStore';
import { IIconOutLine } from '../../common/outs/TOutType';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { SwitchComponent } from './Switch.cmp';
import { SwitchOptionComponent } from './SwitchOption.cmp';
import { SwitchOptionStore } from './SwitchOption.store';
import { SwitchOptionTransformer } from './SwitchOption.transformer';
import { SwitchTransformer } from './Switch.transformer';
import { SwitchOptionDto } from './SwitchOption.dto';

export class SwitchStore extends ThreadsIconStore<SwitchOptionStore> {

  constructor(params: IThreadsIconParams<SwitchOptionStore>) {
    super(params);
    this.block.resizeBarGap = CELL_HALF;
  }

  initShape(): void {
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
        this.threads.shape.height +
        CELL_SIZE
    });
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y,
    });
    this.threads.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height + CELL_SIZE,
    });
    runInAction(() => {
      this.threads.valencePointY = () => this.position.y + this.block.shape.height + CELL_HALF;
      this.threads.gapControlsY = () => this.position.y + this.block.shape.height + CELL_SIZE * 2;
    });
  }

  protected getIconOutLines(): IIconOutLine[] {
    return this.threads.getIconOutLines();
  }

  @computed get rectPolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y;
    const h = this.block.shape.height;

    const x1 = x - this.block.shape.leftSize - CELL_SIZE;
    const x2 = x + this.block.shape.rightSize;
    const x3 = x + this.block.shape.rightSize + CELL_SIZE;
    const x4 = x - this.block.shape.leftSize;

    const y1 = y;
    const y2 = y + h;


    const points: number[][] = [
      [x1, y1],
      [x2, y1],
      [x3, y2],
      [x4, y2],
      [x1, y1],
    ];

    return points.map(p => p.join(',')).join(' ');
  }

  protected getValencePointY(): number {
    return this.position.y + this.block.shape.height + CELL_HALF;
  }

  getRenderer(): TIconRenderer<any> {
    return SwitchComponent;
  }

  createChildFromDto(dto: SwitchOptionDto): SwitchOptionStore {
    return (this.transformer as SwitchTransformer).switchOptionTransformer.fromDto(this.scheme, dto);
  }
}