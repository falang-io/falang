import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import type { TActivepiecesActionData } from '@falang/workflow-dto';
import { ActivepiecesActionBlockComponent } from './activepieces-action-block.cmp.js';
import { ActivepiecesActionEditorComponent } from './activepieces-action-editor.cmp.js';
import { ActivepiecesActionEditorStore } from './activepieces-action-editor.store.js';

/** One block backing the single `activepieces-action` node kind — see ADR 0010 (private). */
export const activepiecesActionBlockConfig = {
  view: ActivepiecesActionBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    type: EditorType.sidebar,
    view: ActivepiecesActionEditorComponent,
    editorFactory: (params) => new ActivepiecesActionEditorStore(params),
  },
} satisfies IBlockConfig<TActivepiecesActionData>;
