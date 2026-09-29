import type { zod } from '@falang/dto';
import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';
import type { externalApiHeadDto } from '@falang/typescript-dto';

export type IExternalApiHead = zod.infer<typeof externalApiHeadDto>;

export class ExternalApiHeadBlockEditorStore extends BlockEditorStore<IExternalApiHead> {
  @observable data: IExternalApiHead;

  constructor(params: IBlockEditorFactoryParams<IExternalApiHead>) {
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
}
