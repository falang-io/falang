import type { IBlockEditorFactoryParams } from '@falang/scheme';
import { action, computed, makeObservable } from 'mobx';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';

/**
 * The `if` condition must type-check as `boolean` — hidden-prefixed with a forced `boolean`
 * assignment on top of the enclosing scope (see `ExpressionBlockEditorStore.buildHiddenPrefixForType`),
 * the same "declare a hidden typed value, let the user's expression type-check against it" pattern
 * `arr-op-input`'s `value` field uses for its array element type.
 */
export class IfEditorStore extends ExpressionBlockEditorStore<string> {
  readonly codeStore: CodeModelStore;

  constructor(params: IBlockEditorFactoryParams<string>) {
    super(params);
    makeObservable(this);
    this.codeStore = new CodeModelStore({
      id: params.icon.id,
      value: params.data,
      hiddenPrefix: this.hiddenPrefix,
    });
  }

  @computed get hiddenPrefix(): string {
    return this.buildHiddenPrefixForType({ type: 'boolean' });
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
