import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { arrSliceDto } from '@falang/typescript-dto';
import { makeObservable } from 'mobx';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { NewVariableStore } from '../../block-elements/new-variable/new-variable.store.js';
import { collectScopeVariables } from '../../monaco/scope/collect-scope-variables.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';

export type IArrSlice = zod.infer<typeof arrSliceDto>;

export class ArrSliceBlockEditorStore extends ExpressionBlockEditorStore<IArrSlice> {
  readonly arrCodeStore: CodeModelStore;
  readonly variableStore: NewVariableStore;
  readonly startCodeStore: CodeModelStore;
  readonly endCodeStore: CodeModelStore;

  constructor(params: IBlockEditorFactoryParams<IArrSlice>) {
    super(params);
    makeObservable(this);
    this.arrCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'arr',
      value: params.data.arr,
      hiddenPrefix: this.hiddenScopeCode,
    });
    this.variableStore = new NewVariableStore({
      value: params.data.variable,
      getScopeNames: () => collectScopeVariables(this.dataNode).map((variable) => variable.name),
    });
    this.startCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'start',
      value: params.data.start,
      hiddenPrefix: this.hiddenScopeCode,
    });
    this.endCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'end',
      value: params.data.end,
      hiddenPrefix: this.hiddenScopeCode,
    });
  }

  getData(): IArrSlice {
    return {
      arr: this.arrCodeStore.value,
      variable: this.variableStore.value,
      start: this.startCodeStore.value,
      end: this.endCodeStore.value,
    };
  }

  override dispose() {
    this.arrCodeStore.dispose();
    this.startCodeStore.dispose();
    this.endCodeStore.dispose();
  }
}
