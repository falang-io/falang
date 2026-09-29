import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ExternalApiItemBlockComponent } from './external-api-item-block.cmp.js';
import { ExternalApiItemBlockEditorStore } from './external-api-item-editor.store.js';
import type { IExternalApiItem } from './external-api-item-editor.store.js';
import { ExternalApiItemSidebarEditorComponent } from './external-api-item-sidebar-editor.cmp.js';

export const externalApiItemBlockConfig = {
  view: ExternalApiItemBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ExternalApiItemSidebarEditorComponent,
    editorFactory: (params) => new ExternalApiItemBlockEditorStore(params),
    type: EditorType.sidebar,
  },
} satisfies IBlockConfig<IExternalApiItem>;
