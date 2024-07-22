import { computed, makeObservable, runInAction } from 'mobx';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { IconWithSkewerStore, IIconWithSkewerStoreParams } from '../../common/skewer/IconWithSkewer.store';
import { IThreadsIconParams, ThreadsIconStore } from '../../common/threads/ThreadsIconStore';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconStore } from '../base/Icon.store';
import { MindTreeRootIconComponent } from './MindTreeRoot.icon.cmp';
import { MindTreeThreadIconStore } from './MindTreeThread.icon.store';

export interface IMindTreeRootIconStore extends IThreadsIconParams<MindTreeThreadIconStore> {
  header: IconStore
}

export class MindTreeRootIconStore extends  ThreadsIconStore<MindTreeThreadIconStore> {
  header: IconStore

  constructor(params: IMindTreeRootIconStore) {
    super({
      ...params,
      disableOutlines: true,
    });
    this.header = params.header;
    this.header.setParentId(this.id);
    makeObservable(this);
  }

  @computed get leftX(): number {
    const leftId = this.list.iconsIds[0];
    if(!leftId) return 0;
    const leftIcon = this.scheme.icons.get(leftId);
    return leftIcon.position.x + leftIcon.block.shape.halfWidth;
  }

  @computed get rightX(): number {
    const rightId = this.list.iconsIds[this.list.iconsIds.length - 1];
    if(!rightId) return 0;
    const leftIcon = this.scheme.icons.get(rightId);
    return leftIcon.position.x + leftIcon.block.shape.halfWidth;
  }

  @computed get centerX(): number {
    return Math.round((this.leftX + (this.rightX - this.leftX) / 2) / CELL_SIZE) * CELL_SIZE;
  }

  initShape(): void {
    super.initShape();
    this.block.position.setPosition({
      x: () => this.centerX - this.block.shape.leftSize,
      y: () => this.position.y + this.header.block.shape.height + CELL_SIZE,
    });
    this.threads.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height + CELL_SIZE + this.header.block.shape.height + CELL_SIZE,
    });
    this.header.position.setPosition({
      x: () => this.centerX,
      y: () => this.position.y,
    });
    this.header.block.position.setPosition({
      x: () => this.centerX - this.header.block.shape.leftSize,
      y: () => this.position.y,
    })    
    this.header.block.resizeBarGap = CELL_SIZE;
    this.block.resizeBarGap = CELL_SIZE;
    this.header.shape.setSize({
      leftSize: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.leftSize + CELL_SIZE : 0,
      rightSize: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.rightSize + CELL_SIZE : 0,
      height: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.height + CELL_SIZE : 0,
    });    
    this.shape.setSize({
      leftSize: 0,
      rightSize: () => Math.max(
        this.block.shape.width,
        CELL_SIZE + this.threads.shape.rightSize,
      ),
      height: () => this.block.shape.height + this.threads.shape.height + CELL_SIZE + this.header.shape.height + CELL_SIZE,
    });
    this.threads.valencePointY = () => this.position.y + this.block.shape.height + CELL_SIZE + this.header.block.shape.height + CELL_SIZE;
  }

  getRenderer(): TIconRenderer<any> {
    return MindTreeRootIconComponent;
  }
}