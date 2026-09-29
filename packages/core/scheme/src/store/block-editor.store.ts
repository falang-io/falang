import type { DependencyContainer } from '@falang/di';
import type { IconStore } from './icon.store.js';

export interface IBlockEditorFactoryParams<TData = unknown> {
  container: DependencyContainer;
  data: TData;
  icon: IconStore;
}

export type TBlockEditorFactory<
  TData = unknown,
  TBlockEditor extends BlockEditorStore<TData> = BlockEditorStore<TData>,
> = (params: IBlockEditorFactoryParams<TData>) => TBlockEditor;

export abstract class BlockEditorStore<TData = unknown> {
  protected initialData: TData;
  readonly container: DependencyContainer;
  constructor(params: IBlockEditorFactoryParams<TData>) {
    this.container = params.container;
    this.initialData = params.data;
  }

  abstract getData(): TData;

  dispose() {
    //
  }
}
