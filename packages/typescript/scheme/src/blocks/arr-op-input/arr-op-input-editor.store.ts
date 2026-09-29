import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { arrPushDto } from '@falang/typescript-dto';
import { computed, makeObservable } from 'mobx';
import {
  ARRAY_TYPE_ALIAS_DECL,
  ARRAY_UNKNOWN_TYPE_EXPRESSION,
  buildArrayElementTypeExpression,
} from '@falang/typescript-common';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import { buildTypedValueHiddenPrefix } from '../../monaco/scope/typed-value-hidden-prefix.js';

export type IArrOpInput = zod.infer<typeof arrPushDto>;

/** Editor for array operations that require a value to insert into an array (arr-push, arr-unshift). */
export class ArrOpInputBlockEditorStore extends ExpressionBlockEditorStore<IArrOpInput> {
  readonly arrCodeStore: CodeModelStore;
  readonly valueCodeStore: CodeModelStore;

  constructor(params: IBlockEditorFactoryParams<IArrOpInput>) {
    super(params);
    makeObservable(this);
    this.arrCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'arr',
      value: params.data.arr,
      hiddenPrefix: this.arrHiddenPrefix,
    });
    this.valueCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'value',
      value: params.data.value,
      hiddenPrefix: this.valueHiddenPrefix,
    });
  }

  @computed get arrHiddenPrefix(): string {
    return buildTypedValueHiddenPrefix(this.hiddenScopeCode + ARRAY_TYPE_ALIAS_DECL, ARRAY_UNKNOWN_TYPE_EXPRESSION);
  }

  /** Types the value field as the `arr` field's element type, inferred from whatever's currently typed there. */
  @computed get valueHiddenPrefix(): string {
    const elementType = buildArrayElementTypeExpression(this.arrCodeStore.value);
    return buildTypedValueHiddenPrefix(this.hiddenScopeCode, elementType);
  }

  getData(): IArrOpInput {
    return { arr: this.arrCodeStore.value, value: this.valueCodeStore.value };
  }

  override dispose() {
    this.arrCodeStore.dispose();
    this.valueCodeStore.dispose();
  }
}
