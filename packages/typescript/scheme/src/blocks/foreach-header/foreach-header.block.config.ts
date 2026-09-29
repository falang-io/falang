import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ForeachHeaderBlockComponent } from './foreach-header-block.cmp.js';
import { ForeachHeaderBlockEditorStore } from './foreach-header-editor.store.js';
import type { IForeachHeader } from './foreach-header-editor.store.js';
import { ForeachHeaderBlockEditorComponent } from './foreach-header-editor.cmp.js';

export const foreachHeaderBlockConfig = {
  view: ForeachHeaderBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ForeachHeaderBlockEditorComponent,
    editorFactory: (params) => new ForeachHeaderBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IForeachHeader>;
