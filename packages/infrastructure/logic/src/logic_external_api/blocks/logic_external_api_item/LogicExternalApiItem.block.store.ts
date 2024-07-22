import { IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE, CELL_SIZE_2 } from '@falang/editor-scheme';
import { IBlockBadge } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { IBlockLine } from '@falang/editor-scheme';
import { LogicBaseBlockStore } from '../../../logic/blocks/logic-base/LogicBaseBlock.store';
import { Text2Store } from '@falang/infrastructure-text';
import { LogicExternalApiItemBlockDto } from './LogicExternalApiItem.block.dto';

export interface ILogicExternalApiItemBlockStoreParams extends IBlockStoreParams, LogicExternalApiItemBlockDto {}

const KEYS_WIDTH = CELL_SIZE * 3;

export class LogicExternalApiItemBlockStore extends LogicBaseBlockStore {
  readonly keyStore: Text2Store;
  readonly valueStore: Text2Store;

  constructor(params: ILogicExternalApiItemBlockStoreParams) {
    super(params);
    const scheme = params.scheme;
    this.keyStore = new Text2Store({
      scheme,
      text: String(params.key),
      minHeight: CELL_SIZE,
      singleLine: true,
    });
    this.valueStore = new Text2Store({
      scheme,
      text: String(params.value),
      minHeight: CELL_SIZE,
      singleLine: true,
    });    
  }

  protected initShape(): void {
    super.initShape();
    this.shape.setHeight(CELL_SIZE_2);
    this.keyStore.position.setPosition({
      x: () => this.position.x + KEYS_WIDTH,
      y: () => this.position.y,
    });
    this.keyStore.shape.setWidth(() => this.shape.width - KEYS_WIDTH);
    this.valueStore.position.setPosition({
      x: () => this.position.x + KEYS_WIDTH,
      y: () => this.position.y + CELL_SIZE,
    });
    this.valueStore.shape.setWidth(() => this.shape.width - KEYS_WIDTH);
  }

  getBlocksInBlock(): IBlockInBlock<any>[] {
    return [this.keyStore, this.valueStore];
  }

  getBlockBadges(): IBlockBadge[] {
    const t = this.scheme.frontRoot.lang.t;
    return [{
      dx: 0,
      dy: 0,
      text: t('logic:key'),
    }, {
      dx: 0,
      dy: CELL_SIZE,
      text: t('logic:value'),
    }];
  }

  getBlockLines(): IBlockLine[] | null {
    return [{
      dx1: 0,
      dx2: this.shape.width,
      dy1: CELL_SIZE,
      dy2: CELL_SIZE,
    },{
      dx1: KEYS_WIDTH,
      dx2: KEYS_WIDTH,
      dy1: 0,
      dy2: CELL_SIZE_2,
    }];   
  }
}