import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ArrOpReturningBlockComponent } from './arr-op-returning-block.cmp.js';
import { ArrOpReturningBlockEditorStore } from './arr-op-returning-editor.store.js';
import type { IArrOpReturning } from './arr-op-returning-editor.store.js';
import { ArrOpReturningBlockEditorComponent } from './arr-op-returning-editor.cmp.js';

export const arrOpReturningBlockConfig = {
  view: ArrOpReturningBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ArrOpReturningBlockEditorComponent,
    editorFactory: (params) => new ArrOpReturningBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IArrOpReturning>;
