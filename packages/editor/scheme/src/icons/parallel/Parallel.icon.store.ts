import { runInAction } from 'mobx';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { SingleThreadIconStore } from '../../common/threads/SignleThreadIcon.store';
import { IThreadsIconParams, ThreadsIconStore } from '../../common/threads/ThreadsIconStore';
import { IIconOutLine } from '../../common/outs/TOutType';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { ParallelIconComponent } from './Paralle.icon.cmp';
import { ParallelThreadIconStore } from './ParallelThread.icon.store';
import { ParallelThreadIconComponent } from './ParallelThreadIcon.cmp';
import { ParallelThreadDto, ParallelThreadIconDto } from './Parallel.icon.dto';
import { ParallelIconTransformer } from './Parallel.icon.transformer';

export class ParallelIconStore extends ThreadsIconStore<ParallelThreadIconStore> {

  constructor(params: IThreadsIconParams<ParallelThreadIconStore>) {
    super({
      ...params,
      canHaveOutlines: false,
    });
  }

  initShape(): void {
    super.initShape();
    this.shape.setSize({
      leftSize: () =>
        Math.max(
          this.block.shape.leftSize + CELL_SIZE,
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
    this.block.shape.setSize({
      'leftSize': CELL_SIZE * 5,
      rightSize: CELL_SIZE * 5,
      height: () => this.scheme.isEditing ? CELL_SIZE : 0,
    })
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y,
    });
    this.threads.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height + CELL_SIZE,
    });
    runInAction(() => {
      this.threads.valencePointY = () => this.position.y + CELL_SIZE + CELL_HALF;
      this.threads.gapControlsY = () => this.position.y + CELL_SIZE * 3;
    });
  }

  getCycleDepth(): number {
    return 0;
  }

  canHaveReturn(): boolean {
    return false;
  }

  getRenderer(): TIconRenderer<any> {
    return ParallelIconComponent;
  }

  protected getIconOutLines(): IIconOutLine[] {
    return [];
  }


  createChildFromDto(dto: ParallelThreadIconDto): ParallelThreadIconStore {
    return (this.transformer as ParallelIconTransformer).threadTransformer.fromDto(this.scheme, dto);
  }
}