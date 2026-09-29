import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { foreachHeaderDto } from '@falang/typescript-dto';
import { action, makeObservable, observable } from 'mobx';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';

export type IForeachHeader = zod.infer<typeof foreachHeaderDto>;

export class ForeachHeaderBlockEditorStore extends ExpressionBlockEditorStore<IForeachHeader> {
  @observable data: IForeachHeader;
  readonly arrCodeStore: CodeModelStore;

  constructor(params: IBlockEditorFactoryParams<IForeachHeader>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
    this.arrCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'arr',
      value: params.data.arr,
      hiddenPrefix: this.hiddenScopeCode,
    });
  }

  getData(): IForeachHeader {
    return { ...this.data, arr: this.arrCodeStore.value };
  }

  @action setItem(item: string) {
    this.data = { ...this.data, item };
  }

  @action setIndex(index: string) {
    this.data = { ...this.data, index };
  }

  override dispose() {
    this.arrCodeStore.dispose();
  }
}
