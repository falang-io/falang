import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { EnumItemBlockComponent } from './enum-item-block.cmp.js';
import { EnumItemBlockEditorStore } from './enum-item-editor.store.js';
import type { IEnumItem } from './enum-item-editor.store.js';
import { EnumItemBlockEditorComponent } from './enum-item-editor.cmp.js';

export const enumItemBlockConfig = {
  view: EnumItemBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: EnumItemBlockEditorComponent,
    editorFactory: (params) => new EnumItemBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IEnumItem>;
