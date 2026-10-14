import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { arrInsertDto } from '@falang/typescript-dto';
import { computed, makeObservable, observable } from 'mobx';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';
import { arrayOfSameTypePrefix } from '../../field-check/prefix-builders.js';

export type IArrInsert = zod.infer<typeof arrInsertDto>;

export class ArrInsertBlockEditorStore extends ExpressionBlockEditorStore<IArrInsert> {
  @observable data: IArrInsert;
  readonly arrCodeStore: CodeModelStore;
  readonly startCodeStore: CodeModelStore;
  readonly insertArrCodeStore: CodeModelStore;

  constructor(params: IBlockEditorFactoryParams<IArrInsert>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
    this.arrCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'arr',
      value: params.data.arr,
      hiddenPrefix: this.hiddenScopeCode,
    });
    this.startCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'start',
      value: params.data.start,
      hiddenPrefix: this.hiddenScopeCode,
    });
    this.insertArrCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'insertArr',
      value: params.data.insertArr,
      hiddenPrefix: this.insertArrHiddenPrefix,
    });
  }

  /** Types the inserted-items field as the same array type as `arr`, inferred from what's typed there. */
  @computed get insertArrHiddenPrefix(): string {
    return arrayOfSameTypePrefix(this.hiddenScopeCode, this.arrCodeStore.value);
  }

  getData(): IArrInsert {
    return {
      ...this.data,
      arr: this.arrCodeStore.value,
      start: this.startCodeStore.value,
      insertArr: this.insertArrCodeStore.value,
    };
  }

  override dispose() {
    this.arrCodeStore.dispose();
    this.startCodeStore.dispose();
    this.insertArrCodeStore.dispose();
  }
}
