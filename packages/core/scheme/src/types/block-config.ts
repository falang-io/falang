import type { BlockEditorStore, IBlockEditorFactoryParams, TBlockEditorFactory } from '../store/block-editor.store.js';
import type { IconStore } from '../store/icon.store.js';

export enum EditorType {
  inline = 'inline',
  sidebar = 'sidebar',
  /** The concrete `BlockEditorStore` instance reports its own type via `editorType` — see `resolveEditorType`. */
  configurable = 'configurable',
}

/** Duck-typed shape a `BlockEditorStore` satisfies to answer for an `EditorType.configurable` block. */
export interface IEditorTypeAware {
  readonly editorType?: 'inline' | 'sidebar';
}

export type TBlockEditorView<TBlockEditor extends BlockEditorStore = BlockEditorStore> = React.FC<{
  icon: IconStore;
  editor: TBlockEditor;
}>;

export interface IBlockViewProps<TData = unknown> {
  width: number;
  data: TData;
  icon: IconStore;
}

export type IBlockView<TData = unknown> = React.FC<IBlockViewProps<TData>>;

export interface IBlockEditorConfig<
  TData = unknown,
  TBlockEditor extends BlockEditorStore<TData> = BlockEditorStore<TData>,
> {
  type: EditorType;
  editorFactory(params: IBlockEditorFactoryParams<TData>): ReturnType<TBlockEditorFactory<TData, TBlockEditor>>;
  view(props: { icon: IconStore; editor: TBlockEditor }): ReturnType<TBlockEditorView<TBlockEditor>>;
}

export interface IBlockConfig<TData = unknown> {
  view(props: IBlockViewProps<TData>): ReturnType<IBlockView<TData>>;
  minHeight?: number;
  defaultWidth?: number;
  /**
   * default: true
   */
  resizable?: boolean;
  editor?: IBlockEditorConfig<TData>;
}

/**
 * Resolves a block's actual editor type: static `inline`/`sidebar` pass through unchanged, while
 * `configurable` defers to the constructed editor store's own `editorType` (defaulting to
 * `inline` if the store doesn't declare one) — see `IEditorTypeAware`. One shared
 * `IBlockEditorConfig` can therefore back node kinds that individually choose inline vs sidebar
 * (e.g. every vendor's integration action node sharing one config).
 */
export const resolveEditorType = (
  editorConfig: IBlockEditorConfig | undefined,
  store: BlockEditorStore | null,
): 'inline' | 'sidebar' => {
  if (!editorConfig) return 'inline';
  if (editorConfig.type !== EditorType.configurable) return editorConfig.type;
  return (store as IEditorTypeAware | null)?.editorType ?? 'inline';
};
