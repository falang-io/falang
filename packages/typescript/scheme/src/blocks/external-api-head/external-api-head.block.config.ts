import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ExternalApiHeadBlockComponent } from './external-api-head-block.cmp.js';
import { ExternalApiHeadBlockEditorStore } from './external-api-head-editor.store.js';
import type { IExternalApiHead } from './external-api-head-editor.store.js';
import { ExternalApiHeadBlockEditorComponent } from './external-api-head-editor.cmp.js';

export const externalApiHeadBlockConfig = {
  view: ExternalApiHeadBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ExternalApiHeadBlockEditorComponent,
    editorFactory: (params) => new ExternalApiHeadBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IExternalApiHead>;
