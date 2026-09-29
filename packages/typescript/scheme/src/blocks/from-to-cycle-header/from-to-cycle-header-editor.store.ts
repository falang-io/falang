import type { zod } from '@falang/dto';
import type { IBlockEditorFactoryParams } from '@falang/scheme';
import type { fromToCycleHeaderDto } from '@falang/typescript-dto';
import { action, makeObservable, observable } from 'mobx';
import { CodeModelStore } from '../../block-elements/code/code-model.store.js';
import { ExpressionBlockEditorStore } from '../../monaco/scope/expression-block-editor.store.js';

export type IFromToCycleHeader = zod.infer<typeof fromToCycleHeaderDto>;

export class FromToCycleHeaderBlockEditorStore extends ExpressionBlockEditorStore<IFromToCycleHeader> {
  @observable data: IFromToCycleHeader;
  readonly fromCodeStore: CodeModelStore;
  readonly toCodeStore: CodeModelStore;

  constructor(params: IBlockEditorFactoryParams<IFromToCycleHeader>) {
    super(params);
    this.data = params.data;
    makeObservable(this);
    this.fromCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'from',
      value: params.data.from,
      hiddenPrefix: this.hiddenScopeCode,
    });
    this.toCodeStore = new CodeModelStore({
      id: params.icon.id,
      name: 'to',
      value: params.data.to,
      hiddenPrefix: this.hiddenScopeCode,
    });
  }

  getData(): IFromToCycleHeader {
    return { ...this.data, from: this.fromCodeStore.value, to: this.toCodeStore.value };
  }

  @action setItem(item: string) {
    this.data = { ...this.data, item };
  }

  override dispose() {
    this.fromCodeStore.dispose();
    this.toCodeStore.dispose();
  }
}
