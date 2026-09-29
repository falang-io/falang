import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ArrOpInputBlockComponent } from './arr-op-input-block.cmp.js';
import { ArrOpInputBlockEditorStore } from './arr-op-input-editor.store.js';
import type { IArrOpInput } from './arr-op-input-editor.store.js';
import { ArrOpInputBlockEditorComponent } from './arr-op-input-editor.cmp.js';

export const arrOpInputBlockConfig = {
  view: ArrOpInputBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ArrOpInputBlockEditorComponent,
    editorFactory: (params) => new ArrOpInputBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IArrOpInput>;
