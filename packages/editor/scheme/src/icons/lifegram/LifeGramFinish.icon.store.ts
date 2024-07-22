import { computed, makeObservable } from 'mobx';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { IIconWithSkewerStoreParams, IconWithSkewerStore } from '../../common/skewer/IconWithSkewer.store';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { IconStore } from '../base/Icon.store';
import { LifeGramFinishIconComponent } from './LifeGramFinishIcon.cmp';

export interface IFunctionIconStoreParams extends IIconWithSkewerStoreParams {
  footer: IconStore,
}

export class LifeGramFinishIconStore extends IconWithSkewerStore {
  readonly footer: IconStore;
  constructor({ footer, ...params }: IFunctionIconStoreParams) {
    super(params);
    this.footer = footer;
    this.footer.setParentId(this.id);
    makeObservable(this);
  }

  initShape(): void {
    super.initShape();
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y + CELL_SIZE,
    });
    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height + CELL_SIZE * 2,
    });
    this.footer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + CELL_SIZE + this.skewer.shape.height + this.block.shape.height + CELL_SIZE,
    });
    this.footer.block.position.setPosition({
      x: () => this.position.x - this.footer.block.shape.leftSize,
      y: () => this.footer.position.y,
    });
    this.shape.setSize({
      leftSize: () => Math.max(
        this.block.shape.leftSize,
        this.skewer.shape.leftSize,
        this.footer.block.shape.leftSize + CELL_SIZE,
      ),
      rightSize: () => Math.max(
        this.block.shape.rightSize,
        this.skewer.shape.rightSize,
        this.footer.block.shape.rightSize + CELL_SIZE,
      ),
      height: () => this.block.shape.height + CELL_SIZE + this.skewer.shape.height + this.footer.block.shape.height,
    });
  }

  @computed get trianglePolylinePoints(): string {
    const x = this.position.x;
    const y = this.position.y + this.block.shape.height + CELL_SIZE;

    return [
      [x + this.block.shape.rightSize, y],
      [x, y + CELL_SIZE],
      [x - this.block.shape.leftSize, y],
    ].map(p => p.join(',')).join(' ');
  }

  getRenderer(): TIconRenderer<any> {
    return LifeGramFinishIconComponent;
  }
}