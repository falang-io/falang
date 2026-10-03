import { BlockEditorStore, type IBlockEditorFactoryParams } from '@falang/scheme';
import { decodeLegacyHtml } from '../expression/decode-legacy-html.js';
import { action, makeObservable, observable } from 'mobx';

export class TextBlockEditorStore extends BlockEditorStore<string> {
  @observable data = '';

  constructor(params: IBlockEditorFactoryParams<string>) {
    super(params);
    this.data = decodeLegacyHtml(params.data ?? '');
    makeObservable(this);
  }

  getData() {
    return this.data;
  }

  @action setValue(value: string) {
    this.data = value;
  }
}
