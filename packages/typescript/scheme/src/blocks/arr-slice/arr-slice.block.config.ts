import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ArrSliceBlockComponent } from './arr-slice-block.cmp.js';
import { ArrSliceBlockEditorStore } from './arr-slice-editor.store.js';
import type { IArrSlice } from './arr-slice-editor.store.js';
import { ArrSliceBlockEditorComponent } from './arr-slice-editor.cmp.js';

export const arrSliceBlockConfig = {
  view: ArrSliceBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ArrSliceBlockEditorComponent,
    editorFactory: (params) => new ArrSliceBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IArrSlice>;
