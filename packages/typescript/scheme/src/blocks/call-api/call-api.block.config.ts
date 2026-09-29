import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { CallApiBlockComponent } from './call-api-block.cmp.js';
import { CallApiBlockEditorStore } from './call-api-editor.store.js';
import type { ICallApi } from './call-api-editor.store.js';
import { CallApiBlockEditorComponent } from './call-api-editor.cmp.js';

export const callApiBlockConfig = {
  view: CallApiBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: CallApiBlockEditorComponent,
    editorFactory: (params) => new CallApiBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<ICallApi>;
