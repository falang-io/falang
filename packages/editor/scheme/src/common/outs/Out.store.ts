import { computed, makeObservable } from 'mobx';
import { checker } from '../../checker';
import { CELL_SIZE } from '../constants';
import { IconStore, IIconParams } from '../../icons/base/Icon.store';
import { CycleIconStore } from '../../icons/cycle/Cycle.icon.store';
import { FunctionIconStore } from '../../icons/function/Function.icon.store';
import { OutMinimalBlockStore } from './block/OutMinimal.block.store';
import { IBlockBadge } from '../IBlockBadge';

export const OutTypes = ['break', 'continue', 'return', 'throw'] as const;

export type TOutType = typeof OutTypes[number];

export interface IOutStoreParams extends IIconParams {
  type: TOutType
  outLevel?: number
  //isBlockShape?: (out: OutStore) => boolean
}

export class OutStore extends IconStore {
  readonly type: TOutType
  readonly outLevel: number

  constructor({ type, outLevel, ...params }: IOutStoreParams) {
    super(params);
    this.type = type;
    this.outLevel = outLevel ?? 1;
    this.block.resizeBarGap = CELL_SIZE;
    makeObservable(this);
  }

  get isBlockShape() {
    if (this.block.isMeUnderEdit) return true;
    return this.block.isHasValue();
  }

  initShape(): void {
    super.initShape();
    const parent = this.parent;
    if (checker.isIconWithSkewer(parent)) {
      this.position.setPosition({
        x: () => parent.position.x,
        y: () => parent.skewer.position.y + parent.list.iconsHeightSum,
      })
    } else {
      console.warn('should be skewer', parent);
    }
    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.halfWidth,
      y: () => this.position.y,
    });
    this.shape.setSize({
      leftSize: () => {
        if (!this.block.isHasValue() && !this.block.isMeUnderEdit) {
          return CELL_SIZE * 2;
        }
        return this.block.shape.leftSize + CELL_SIZE
      },
      rightSize: () => {
        if (!this.block.isHasValue() && !this.block.isMeUnderEdit) {
          return CELL_SIZE * 2;
        }
        return this.block.shape.rightSize + CELL_SIZE;
      },
      height: () => {
        if (!this.block.isHasValue() && !this.block.isMeUnderEdit) {
          if (!this.scheme.isEditing) {
            return 0;
          }
          return CELL_SIZE * 2;
        }
        return this.isIconVisible ? this.block.shape.height + CELL_SIZE : 0
      },
    });
  }

  @computed get isIconVisible() {
    return this.scheme.isEditing || this.isBlockShape;
  }

  @computed get targetId(): string {
    if (this.type === 'return') {
      const parentsFunctions = this.getParentsByType(FunctionIconStore);
      if (parentsFunctions.length) {
        return parentsFunctions[0].id;
      }
    } else {
      const parentCycles = this.getParentsByType(CycleIconStore);
      const targetCycle = parentCycles[this.outLevel - 1];
      if (targetCycle) return targetCycle.id;
    }
    return '';
  }

  isOut(): boolean {
    return true;
  }
}