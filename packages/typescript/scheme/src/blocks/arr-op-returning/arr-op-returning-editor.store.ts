import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { arrPopDto } from '@falang/typescript-dto';
import { computed, makeObservable } from 'mobx';
import { ARRAY_TYPE_ALIAS_DECL, ARRAY_UNKNOWN_TYPE_EXPRESSION } from '@falang/typescript-common';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { NewVariableStore } from '../../block-elements/new-variable/new-variable.store.js';
import { collectScopeVariables } from '../../monaco/scope/collect-scope-variables.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import { buildTypedValueHiddenPrefix } from '../../monaco/scope/typed-value-hidden-prefix.js';

export type IArrOpReturning = zod.infer<typeof arrPopDto>;

/** Editor for array operations that pull an element out of an array into a newly created variable (arr-pop, arr-shift). */
export class ArrOpReturningBlockEditorStore extends ExpressionBlockEditorStore<IArrOpReturning> {
  readonly arrCodeStore: CodeModelStore;
  readonly variableStore: NewVariableStore;

  constructor(params: IBlockEditorFactoryParams<IArrOpReturning>) {
    super(params);
    makeObservable(this);
    this.arrCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'arr',
      value: params.data.arr,
      hiddenPrefix: this.arrHiddenPrefix,
    });
    this.variableStore = new NewVariableStore({
      value: params.data.variable,
      getScopeNames: () => collectScopeVariables(this.dataNode).map((variable) => variable.name),
    });
  }

  @computed get arrHiddenPrefix(): string {
    return buildTypedValueHiddenPrefix(this.hiddenScopeCode + ARRAY_TYPE_ALIAS_DECL, ARRAY_UNKNOWN_TYPE_EXPRESSION);
  }

  getData(): IArrOpReturning {
    return { arr: this.arrCodeStore.value, variable: this.variableStore.value };
  }

  override dispose() {
    this.arrCodeStore.dispose();
  }
}
