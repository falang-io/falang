import type { IBlockEditorFactoryParams } from '@falang/scheme';
import { action, makeObservable } from 'mobx';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';

export class ActionEditorStore extends ExpressionBlockEditorStore<string> {
  readonly codeStore: CodeModelStore;

  constructor(params: IBlockEditorFactoryParams<string>) {
    super(params);
    makeObservable(this);
    this.codeStore = new CodeModelStore({
      id: params.icon.id,
      value: params.data,
      hiddenPrefix: this.hiddenScopeCode,
    });
  }

  getData() {
    return this.codeStore.value;
  }

  @action setValue(value: string) {
    this.codeStore.setValue(value);
  }

  override dispose() {
    this.codeStore.dispose();
  }
}
