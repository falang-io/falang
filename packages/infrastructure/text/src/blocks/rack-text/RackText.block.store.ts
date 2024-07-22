import { BlockStore, IBlockStoreParams } from '@falang/editor-scheme';
import { CELL_SIZE } from '@falang/editor-scheme';
import { IBlockInBlock } from '@falang/editor-scheme';
import { Text2Store } from "../../store/Text2.store";
import { RackTextBlockDto } from "./RackText.block.dto";

export interface IRackTextBlockStoreParams extends Omit<IBlockStoreParams, 'color' | 'text'>, RackTextBlockDto {

}

export class RackTextBlockStore extends BlockStore {
  textStore: Text2Store;
  topTextStore: Text2Store;

  constructor(params: IRackTextBlockStoreParams) {
    super(params);
    this.textStore = new Text2Store({
      scheme: params.scheme,
      text: params.text,
    });
    this.topTextStore = new Text2Store({
      scheme: params.scheme,
      text: params.topText,
      minHeight: CELL_SIZE,
    });
  }

  protected initShape(): void {
    super.initShape();
    this.textStore.shape.setWidth(() => this.width);
    this.topTextStore.shape.setWidth(() => this.width);
    this.textStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y + this.topTextStore.shape.height,
    });
    this.topTextStore.position.setPosition({
      x: () => this.position.x,
      y: () => this.position.y,
    });
    this.shape.setHeight(() => this.topTextStore.shape.height + this.textStore.shape.height);
  }

  getBlocksInBlock(): IBlockInBlock<any>[] {
    return [
      ...super.getBlocksInBlock(),
      this.textStore,
      this.topTextStore,
    ];
  }

  getBlockLines() {
    return [{
      dx1: 0,
      dx2: this.width,
      dy1: this.topTextStore.shape.height,
      dy2: this.topTextStore.shape.height,
    }];
  }

  dispose(): void {
    super.dispose();
    this.textStore.dispose();
    this.topTextStore.dispose();
  }
}