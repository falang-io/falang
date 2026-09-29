import type { zod } from '@falang/dto';
import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';
import type { enumItemDto } from '@falang/typescript-dto';

export type IEnumItem = zod.infer<typeof enumItemDto>;

export class EnumItemBlockEditorStore extends BlockEditorStore<IEnumItem> {
  @observable data: IEnumItem;

  constructor(params: IBlockEditorFactoryParams<IEnumItem>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
  }

  getData() {
    return this.data;
  }

  @action setKey(key: string) {
    this.data = { ...this.data, key };
  }

  @action setValue(value: string) {
    this.data = { ...this.data, value };
  }
}
