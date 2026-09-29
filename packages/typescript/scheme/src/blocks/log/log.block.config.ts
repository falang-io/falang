import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { LogBlockEditorStore } from './log-editor.store.js';
import { LogEditBlockComponent } from './log-edit.block.cmp.js';
import { LogBlockComponent } from './log.block.cmp.js';

export const logBlockConfig = {
  view: LogBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: LogEditBlockComponent,
    editorFactory: (params) => new LogBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<string>;
