import type { IBlockEditorFactoryParams } from '@falang/scheme';
import { makeObservable } from 'mobx';
import { TemplateStringStore } from '../../block-elements/template-string/template-string.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';

/** Editor for the `log` message: a plain string field (no surrounding quotes) that allows `${expr}` interpolation. */
export class LogBlockEditorStore extends ExpressionBlockEditorStore<string> {
  readonly message: TemplateStringStore;

  constructor(params: IBlockEditorFactoryParams<string>) {
    super(params);
    makeObservable(this);
    this.message = new TemplateStringStore({
      id: params.icon.id,
      value: params.data,
      getScopeCode: () => this.hiddenScopeCode,
    });
  }

  getData(): string {
    return this.message.value;
  }

  override dispose() {
    this.message.dispose();
  }
}
