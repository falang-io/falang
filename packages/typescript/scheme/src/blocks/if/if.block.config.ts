import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { IfEditorStore } from './if-editor.store.js';
import { IfEditBlockComponent } from './if-edit.block.cmp.js';
import { IfBlockComponent } from './if.block.cmp.js';

export const ifBlockConfig = {
  view: IfBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: IfEditBlockComponent,
    editorFactory: (params) => new IfEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<string>;
