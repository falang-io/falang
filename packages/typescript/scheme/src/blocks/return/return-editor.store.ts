import type { IBlockEditorFactoryParams } from '@falang/scheme';
import { computed, makeObservable } from 'mobx';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import { buildTypedValueHiddenPrefix } from '../../monaco/scope/typed-value-hidden-prefix.js';
import { decodeLegacyHtml } from '../expression/decode-legacy-html.js';
import { isInValueReturningFunction, RETURN_VALUE_NAME } from './return-value.js';

/** The returned expression, type-checked against the function's return type (`typeof returnValue`). */
export class ReturnEditorStore extends ExpressionBlockEditorStore<string> {
  readonly codeStore: CodeModelStore;
  private readonly returnsValue: boolean;

  constructor(params: IBlockEditorFactoryParams<string>) {
    super(params);
    makeObservable(this);
    this.returnsValue = isInValueReturningFunction(params.icon.dataNode);
    const value = decodeLegacyHtml(params.data ?? '');
    this.codeStore = new CodeModelStore({
      id: params.icon.id,
      value: value.trim() === '' && this.returnsValue ? RETURN_VALUE_NAME : value,
      hiddenPrefix: this.valueHiddenPrefix,
    });
  }

  @computed get valueHiddenPrefix(): string {
    return this.returnsValue
      ? buildTypedValueHiddenPrefix(this.hiddenScopeCode, `typeof ${RETURN_VALUE_NAME}`)
      : this.hiddenScopeCode;
  }

  getData(): string {
    return this.codeStore.value;
  }

  override dispose() {
    this.codeStore.dispose();
  }
}
