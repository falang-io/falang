import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { EnumHeadBlockComponent } from './enum-head-block.cmp.js';
import { EnumHeadBlockEditorStore } from './enum-head-editor.store.js';
import type { IEnumHead } from './enum-head-editor.store.js';
import { EnumHeadBlockEditorComponent } from './enum-head-editor.cmp.js';

export const enumHeadBlockConfig = {
  view: EnumHeadBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: EnumHeadBlockEditorComponent,
    editorFactory: (params) => new EnumHeadBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IEnumHead>;
