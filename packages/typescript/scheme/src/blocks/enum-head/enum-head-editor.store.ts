import type { zod } from '@falang/dto';
import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';
import type { enumHeadDto, TEnumTypeVariant } from '@falang/typescript-dto';

export type IEnumHead = zod.infer<typeof enumHeadDto>;

export class EnumHeadBlockEditorStore extends BlockEditorStore<IEnumHead> {
  @observable data: IEnumHead;

  constructor(params: IBlockEditorFactoryParams<IEnumHead>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
  }

  getData() {
    return this.data;
  }

  @action setName(name: string) {
    this.data = { ...this.data, name };
  }

  @action setValueType(valueType: TEnumTypeVariant) {
    this.data = { ...this.data, valueType };
  }
}
