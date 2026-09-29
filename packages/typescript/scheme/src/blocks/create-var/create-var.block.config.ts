import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { CreateVarBlockComponent } from './create-var-block.cmp.js';
import { CreateVarBlockEditorStore } from './create-var-editor.store.js';
import type { ICreateVar } from './create-var-editor.store.js';
import { CreateVarBlockEditorComponent } from './create-var-editor.cmp.js';

export const createVarBlockConfig = {
  view: CreateVarBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: CreateVarBlockEditorComponent,
    editorFactory: (params) => new CreateVarBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<ICreateVar>;
