import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ActionEditorStore } from './action-editor.store.js';
import { ActionEditBlockComponent } from './action-edit.block.cmp.js';
import { ActionBlockComponent } from './action.block.cmp.js';

export const actionBlockConfig = {
  view: ActionBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ActionEditBlockComponent,
    editorFactory: (params) => new ActionEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<string>;
