import { makeObservable, observable } from 'mobx';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { TEnumTypeVariant, EnumValueTypeVariants } from '../../../logic/constants';
import { EnumHeadBlockDto } from './EnumHead.block.dto';
import { LogicBaseBlockStore } from '../../../logic/blocks/logic-base/LogicBaseBlock.store';
import { validateName } from '../../../logic/util/validateName';
import { Text2Store } from '@falang/infrastructure-text';
import { CELL_SIZE, CELL_SIZE_2 } from '@falang/editor-scheme';
import { SelectStore } from '@falang/infrastructure-text';
import { IBlockInBlock } from '@falang/editor-scheme';
import { IBlockLine } from '@falang/editor-scheme';
import { IBlockBadge } from '@falang/editor-scheme';

export interface IEnumHeadBlockStoreParams extends EnumHeadBlockDto, IBlockStoreParams {}
const BAGDE_WIDTH = CELL_SIZE * 5;

export class EnumHeadBlockStore extends LogicBaseBlockStore {
  @observable selectTypeStore: SelectStore;
  @observable name: Text2Store;

  constructor(params: IEnumHeadBlockStoreParams) {
    super(params);
    this.name = new Text2Store({
      text: params.name,
      scheme: params.scheme,
      singleLine: true,
    });    
    this.selectTypeStore = new SelectStore({
      scheme: params.scheme,
      getOptions: () => {
        const t = params.scheme.frontRoot.lang.t;
        return EnumValueTypeVariants.map((v) => ({
          text: t(`logic:${v}`),
          value: v,
        }))
      }, 
      selectedValue: params.valueType,
    });
    makeObservable(this);
  }

  protected initShape(): void {
    super.initShape();
    this.name.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.name.shape.setWidth(() => this.shape.width);
    this.selectTypeStore.position.setPosition({
      x: () => this.position.x + BAGDE_WIDTH,
      y: () => this.position.y + CELL_SIZE_2,
    });
    this.selectTypeStore.shape.setWidth(() => this.shape.width - BAGDE_WIDTH)
  }

  protected getHeight(): number {
    return CELL_SIZE * 3;
  }

  protected getErrors(): string[] {
    const returnValue = super.getErrors();
    if(!validateName(this.name.text)) {
      returnValue.push(`_{logic:wrong_name}: ${this.name}`);
    }
    return returnValue;
  }

  getBlocksInBlock(): IBlockInBlock<any>[] {
    return [this.selectTypeStore, this.name];
  }

  getBlockLines(): IBlockLine[] | null {
    return [{
      dx1: 0,
      dx2: this.shape.width,
      dy1: CELL_SIZE * 2,
      dy2: CELL_SIZE * 2,
    },{
      dx1: BAGDE_WIDTH,
      dx2: BAGDE_WIDTH,
      dy1: CELL_SIZE * 2,
      dy2: CELL_SIZE * 3,
    }];
  }

  getBlockBadges(): IBlockBadge[] {
    return [{
      dx: 0,
      dy: CELL_SIZE * 2,
      text: this.scheme.frontRoot.lang.t('logic:value_type'),
    }];
  }
}
