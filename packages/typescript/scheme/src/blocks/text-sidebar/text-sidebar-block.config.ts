import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { TextSidebarBlockComponent } from './text-sidebar-block.cmp.js';
import { TextSidebarBlockEditorStore } from './text-sidebar-block-editor.store.js';
import { TextSidebarBlockEditorComponent } from './text-sidebar-block-editor.cmp.js';

export const textSidebarBlockConfig = {
  view: TextSidebarBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: TextSidebarBlockEditorComponent,
    editorFactory: (params) => new TextSidebarBlockEditorStore(params),
    type: EditorType.sidebar,
  },
} satisfies IBlockConfig<string>;
