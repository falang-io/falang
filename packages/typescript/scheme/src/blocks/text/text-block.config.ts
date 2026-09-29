import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { TextBlockComponent } from './text-block.cmp.js';
import { TextBlockEditorStore } from './text-block-editor.store.js';
import { TextBlockEditorComponent } from './text-block-editor.cmp.js';

export const textBlockConfig = {
  view: TextBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: TextBlockEditorComponent,
    editorFactory: (params) => new TextBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<string>;
