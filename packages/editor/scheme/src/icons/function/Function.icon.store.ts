import { computed, makeObservable } from 'mobx';
import { BlockStore } from '../../common/blocks/store/BlocksStore';
import { CELL_HALF, CELL_SIZE } from '../../common/constants';
import { IVericalLine } from '../../common/ILine';
import { IconWithSkewerStore, IIconWithSkewerStoreParams } from '../../common/skewer/IconWithSkewer.store';
import { OutStore } from '../../common/outs/Out.store';
import { IconStore } from '../base/Icon.store';
import { IIconWithList } from '../base/IIconList';
import { IIconOutLine } from '../../common/outs/TOutType';
import { TIconRenderer } from '../../infrastructure/IInfrastructureConfig';
import { FunctionIconComponent } from './Function.icon.cmp';

export interface IFunctionIconStoreParams extends IIconWithSkewerStoreParams {
  header: IconStore,
  footer: IconStore,
  fillBlockWidth?: boolean
}

export class FunctionIconStore extends IconWithSkewerStore implements IIconWithList {
  readonly header: IconStore;
  readonly footer: IconStore;
  readonly fillBlockWidth: boolean;

  constructor({ header, footer, ...params }: IFunctionIconStoreParams) {
    super(params);
    this.header = header;
    this.footer = footer;
    this.block.resizeBarGap = params.fillBlockWidth ? 0 : CELL_SIZE;
    this.header.block.resizeBarGap = CELL_SIZE;
    this.footer.block.resizeBarGap = CELL_SIZE;
    this.header.setParentId(this.id);
    this.footer.setParentId(this.id);
    this.fillBlockWidth = !!params.fillBlockWidth;
    makeObservable(this);
  }

  initShape(): void {
    super.initShape();
    this.header.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.header.shape.setSize({
      leftSize: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.leftSize + CELL_SIZE : 0,
      rightSize: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.rightSize + CELL_SIZE : 0,
      height: () => (this.header.block.isHasValue() || this.scheme.isEditing) ? this.header.block.shape.height + CELL_SIZE : 0,
    });    
    this.header.block.position.setPosition({
      x: () => this.header.position.x - this.header.block.shape.leftSize,
      y: () => this.header.position.y,
    });
    this.footer.position.setPosition({
      x: () => this.position.x,
      y: () => 
        this.position.y
        + this.header.shape.height
        + this.block.shape.height
        + this.skewer.shape.height,
    });
    this.footer.shape.setSize({
      leftSize: () => this.footer.block.shape.leftSize + CELL_SIZE,
      rightSize: () => this.footer.block.shape.rightSize + CELL_SIZE,
      height: () => this.footer.block.shape.height + CELL_SIZE,
    });    
    this.footer.block.position.setPosition({
      x: () => this.footer.position.x - this.footer.block.shape.leftSize,
      y: () => this.footer.position.y + CELL_SIZE,
    });

    this.block.position.setPosition({
      x: () => this.position.x - this.block.shape.leftSize,
      y: () => this.position.y + this.header.shape.height,
    });
    this.shape.setSize({
      height: () => 
        this.header.shape.height
        + this.block.shape.height
        + this.skewer.shape.height
        + this.footer.shape.height,
      leftSize: () => Math.max(
        this.header.shape.leftSize,
        this.block.shape.leftSize + CELL_SIZE,
        this.skewer.shape.leftSize,
        this.footer.shape.leftSize,
      ),
      rightSize: () => Math.max(
        this.header.shape.rightSize,
        this.block.shape.rightSize + CELL_SIZE,
        this.skewer.shape.rightSize,
        this.footer.shape.rightSize,
      ),
    });
    this.skewer.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.block.shape.height + this.header.shape.height,
    })
  }
  
  protected getOutsIds(): string[] {
    const outsIds = this.outsIds;
    return outsIds.filter((outId) => {
      const icon = this.scheme.icons.get(outId) as OutStore;
      if(icon.type === 'return') return false;
      return true;
    });
  }

  @computed get hasReturns(): boolean {
    return !!this.myIconOutlines.length;
  }

  @computed.struct get myIconOutlines(): IIconOutLine[] {
    return this.iconOutLines.filter((outline) => outline.type === 'return');
  }

  @computed get lastReturnX(): number {
    const outlines = this.myIconOutlines.slice();
    if(!outlines.length) return 0;
    outlines.sort((a, b) => a.x - b.x);
    return outlines[outlines.length - 1].x;
  }
  @computed.struct get returnConnectLines(): IVericalLine[] {
    const returnValue: IVericalLine[] = [];
    const y = this.returnLineBottomY;
    this.myIconOutlines.forEach((outline) => {
      returnValue.push({
        x: outline.x,
        y1: outline.y,
        y2: y,
        targetId: outline.targetId,
        type: outline.type,
      });
    });
    return returnValue;
  }

  @computed get returnLineBottomY(): number {
    return this.getReturnLineBottomY();
  }

  protected getReturnLineBottomY(): number {
    return this.position.y + CELL_HALF + this.skewer.shape.height + this.header.shape.height + this.footer.shape.halfHeight + this.block.shape.height;
  }

  @computed get returnsCount(): number {
    return this.getReturnsCount();
  }

  protected getReturnsCount(): number {
    return 1;
  }

  isFunction(): boolean {
    return true;
  }

  canHaveReturn(): boolean {
    return true;
  }

  getRenderer(): TIconRenderer<any> {
    return FunctionIconComponent;
  }

  getReturnDepth(): number {
    return 1;
  }

  dispose(): void {
    this.header.dispose();
    this.footer.dispose();
    super.dispose();
  }
}
