import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { LinkBlockComponent } from './link-block.cmp.js';
import { LinkBlockEditorStore, type ILinkData } from './link-block-editor.store.js';
import { LinkBlockEditorComponent } from './link-block-editor.cmp.js';

export const linkBlockConfig = {
  view: LinkBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: LinkBlockEditorComponent,
    editorFactory: (params) => new LinkBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<ILinkData>;
