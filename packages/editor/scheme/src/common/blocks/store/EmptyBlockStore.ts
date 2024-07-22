import { nanoid } from 'nanoid';
import { CELL_SIZE } from '../../constants';
import { TComputedProperty } from '../../types/TComputedProperty';
import { EmptyBlockTransformer } from '../Block.transformer';
import { BlockStore, IBlockStoreParams } from './BlocksStore';

export interface IEmptyBlockStoreParams extends Omit<IBlockStoreParams, 'width' | 'id' | 'transformer' | 'text'> {
  text?: TComputedProperty<string>
  id?: string
}

export class EmptyBlockStore extends BlockStore {
  readonly text: TComputedProperty<string>;
  constructor({ text, ...params }: IEmptyBlockStoreParams) {
    super({
      ...params,
      id: params.id ?? nanoid(),
      width: CELL_SIZE,
      transformer: new EmptyBlockTransformer('')
    });
    this.text = text ?? null;
  }
}
