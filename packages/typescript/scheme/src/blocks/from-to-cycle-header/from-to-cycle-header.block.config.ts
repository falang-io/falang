import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { FromToCycleHeaderBlockComponent } from './from-to-cycle-header-block.cmp.js';
import { FromToCycleHeaderBlockEditorStore } from './from-to-cycle-header-editor.store.js';
import type { IFromToCycleHeader } from './from-to-cycle-header-editor.store.js';
import { FromToCycleHeaderBlockEditorComponent } from './from-to-cycle-header-editor.cmp.js';

export const fromToCycleHeaderBlockConfig = {
  view: FromToCycleHeaderBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: FromToCycleHeaderBlockEditorComponent,
    editorFactory: (params) => new FromToCycleHeaderBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IFromToCycleHeader>;
