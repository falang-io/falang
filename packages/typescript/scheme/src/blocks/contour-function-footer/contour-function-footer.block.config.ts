import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ContourFunctionFooterBlockComponent } from './contour-function-footer.block.cmp.js';
import { ContourFunctionFooterBlockEditorComponent } from './contour-function-footer.block.editor.cmp.js';
import { ContourFunctionFooterBlockEditorStore } from './contour-function-footer.block.editor.store.js';

export const contourFunctionFooterBlockConfig = {
  view: ContourFunctionFooterBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ContourFunctionFooterBlockEditorComponent,
    editorFactory: (params) => new ContourFunctionFooterBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<string>;
