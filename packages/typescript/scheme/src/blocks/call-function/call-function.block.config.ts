import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { CallFunctionBlockComponent } from './call-function-block.cmp.js';
import { CallFunctionBlockEditorStore } from './call-function-editor.store.js';
import type { ICallFunction } from './call-function-editor.store.js';
import { CallFunctionBlockEditorComponent } from './call-function-editor.cmp.js';

export const callFunctionBlockConfig = {
  view: CallFunctionBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: CallFunctionBlockEditorComponent,
    editorFactory: (params) => new CallFunctionBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<ICallFunction>;
