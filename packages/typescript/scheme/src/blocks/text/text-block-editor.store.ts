import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable, observable } from 'mobx';

export class TextBlockEditorStore extends BlockEditorStore<string> {
  @observable data = '';

  constructor(params: IBlockEditorFactoryParams<string>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
  }

  getData() {
    return this.data;
  }

  @action setValue(value: string) {
    this.data = value;
  }
}
