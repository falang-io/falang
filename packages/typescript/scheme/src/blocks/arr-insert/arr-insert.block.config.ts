import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ArrInsertBlockComponent } from './arr-insert-block.cmp.js';
import { ArrInsertBlockEditorStore } from './arr-insert-editor.store.js';
import type { IArrInsert } from './arr-insert-editor.store.js';
import { ArrInsertBlockEditorComponent } from './arr-insert-editor.cmp.js';

export const arrInsertBlockConfig = {
  view: ArrInsertBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ArrInsertBlockEditorComponent,
    editorFactory: (params) => new ArrInsertBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IArrInsert>;
