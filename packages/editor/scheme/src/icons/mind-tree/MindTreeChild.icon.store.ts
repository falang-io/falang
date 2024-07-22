import { computed, makeObservable } from 'mobx';
import { checker } from '../../checker';
import { CELL_SIZE } from '../../common/constants';
import { IconWithSkewerStore, IIconWithSkewerStoreParams } from '../../common/skewer/IconWithSkewer.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { MindTreeChildIconComponent } from './MindTreeChild.icon.cmp';

export interface IMindTreeChildIconStore extends IIconWithSkewerStoreParams {
  allowChild?: boolean
}

export class MindTreeChildIconStore extends IconWithSkewerStore {
  readonly allowChild: boolean

  constructor(params: IMindTreeChildIconStore) {
    super({
      ...params,
      hideValancePoints: !params.allowChild,
      hideEnds: true,
    });
    this.allowChild = !!params.allowChild;
    makeObservable(this);
  }

  initShape(): void {
    super.initShape();
    this.block.position.setPosition({
      x: () => this.position.x + CELL_SIZE,
      y: () => this.position.y,
    });
    this.skewer.position.setPosition({
      x: () => this.position.x + CELL_SIZE * 2,
      y: () => this.position.y + this.block.shape.height,
    });
    this.shape.setSize({
      leftSize: 0,
      rightSize: () => CELL_SIZE + Math.max(
        this.block.shape.width,
        this.allowChild ? CELL_SIZE + this.skewer.shape.rightSize : 0,
      ),
      height: () => this.block.shape.height + (this.allowChild ? this.skewer.shape.height - CELL_SIZE : 0),
    });
  }

  getRenderer(): TIconRenderer<any> {
    return MindTreeChildIconComponent; 
  }

  @computed get isLast(): boolean {
    const parent = this.parent;
    if(!checker.isIconWithList(parent)) return false; 
    return parent.list.iconsIds.indexOf(this.id) === parent.list.iconsIds.length - 1;
  }
}