import type { IBlockEditorFactoryParams } from '@falang/scheme';
import { BlockEditorStore } from '@falang/scheme';
import { action, makeObservable } from 'mobx';
import type { TCodeLanguage } from '@falang/simple-code-dto';
import { RawCodeModelStore } from '../../block-elements/raw-code/raw-code-model.store.js';

export class RawCodeBlockEditorStore extends BlockEditorStore<string> {
  readonly codeStore: RawCodeModelStore;

  constructor(params: IBlockEditorFactoryParams<string>, language: TCodeLanguage) {
    super(params);
    this.codeStore = new RawCodeModelStore({ id: params.icon.id, language, value: params.data });
    makeObservable(this);
  }

  getData(): string {
    return this.codeStore.value;
  }

  @action setValue(value: string): void {
    this.codeStore.setValue(value);
  }

  override dispose(): void {
    this.codeStore.dispose();
  }
}
