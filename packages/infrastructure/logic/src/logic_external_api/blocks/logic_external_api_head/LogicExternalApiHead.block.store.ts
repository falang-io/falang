import { makeObservable, observable } from 'mobx';
import { IBlockStoreParams } from '@falang/editor-scheme';
import { LogicExternalApiHeadBlockDto } from './LogicExternalApiHead.block.dto';
import { LogicBaseBlockStore } from '../../../logic/blocks/logic-base/LogicBaseBlock.store';
import { validateName } from '../../../logic/util/validateName';
import { Text2Store } from '@falang/infrastructure-text';
import { CELL_SIZE, CELL_SIZE_2 } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { IBlockLine } from '@falang/editor-scheme';
import { IBlockBadge } from '@falang/editor-scheme';

export interface ILogicExternalApiHeadBlockStoreParams extends LogicExternalApiHeadBlockDto, IBlockStoreParams {}

export class LogicExternalApiHeadBlockStore extends LogicBaseBlockStore {
  @observable name: Text2Store;

  constructor(params: ILogicExternalApiHeadBlockStoreParams) {
    super(params);
    this.name = new Text2Store({
      text: params.name,
      scheme: params.scheme,
      singleLine: true,
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
  }

  protected getHeight(): number {
    return CELL_SIZE * 2;
  }

  protected getErrors(): string[] {
    const returnValue = super.getErrors();
    if(!validateName(this.name.text)) {
      returnValue.push(`_{logic:wrong_name}: ${this.name}`);
    }
    return returnValue;
  }

  getBlocksInBlock(): IBlockInBlock<any>[] {
    return [this.name];
  }
}
