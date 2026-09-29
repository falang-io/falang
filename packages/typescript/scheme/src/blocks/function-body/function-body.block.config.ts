import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { FunctionBodyBlockComponent } from './function-body-block.cmp.js';
import { FunctionBodyBlockEditorStore, type IfunctionBody } from './function-body-editor.store.js';
import { FunctionBodySidebarEditorComponent } from './function-body-sidebar-editor.cmp.js';

export const functionBodyBlockConfig = {
  view: FunctionBodyBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: FunctionBodySidebarEditorComponent,
    editorFactory: (params) => new FunctionBodyBlockEditorStore(params),
    type: EditorType.sidebar,
  },
} satisfies IBlockConfig<IfunctionBody>;
