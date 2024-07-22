import { IconStore, IIconParams } from '../../icons/base/Icon.store';
import { IIconWithList } from '../../icons/base/IIconList';
import { IIconOutLine } from '../outs/TOutType';
import { ISkewerStoreParams, SkewerStore } from './Skewer.store';

export interface IIconWithSkewerStoreParams extends IIconParams, ISkewerStoreParams {}

export interface IRightPathItem {
  rightSize: number
  dy: number
}

export interface ILine {
  x1: number,
  y1: number,
  x2: number,
  y2: number,
}

export abstract class IconWithSkewerStore extends IconStore implements IIconWithList {
  readonly skewer: SkewerStore;

  constructor(params: IIconWithSkewerStoreParams) {
    super(params);
    this.skewer = new SkewerStore({
      ...params,
      parent: this,
    });
  }

  get list() {
    return this.skewer;
  }

  dispose() {
    super.dispose();
    this.skewer.dispose();
  }

  isIconWithSkewer(): boolean {
    return true;
  }

  protected getIconOutLines(): IIconOutLine[] {
    return this.skewer.getIconOutLines();
  }

  isExtremeForContinueLevel(level: number, childId?: string | undefined): boolean {
    if(!this.skewer.isLast) return false;
    return !!this.parent?.isExtremeForContinueLevel(level);
  }
}
