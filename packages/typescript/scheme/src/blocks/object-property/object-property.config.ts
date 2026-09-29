import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import { ObjectPropertyBlockComponent } from './object-property-block.cmp.js';
import { ObjectPropertyBlockEditorStore } from './object-property-editor.store.js';
import type { IObjectProperty } from './object-property-editor.store.js';
import { ObjectPropertyBlockEditorComponent } from './object-property-editor.cmp.js';

export const objectPropertyBlockConfig = {
  view: ObjectPropertyBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    view: ObjectPropertyBlockEditorComponent,
    editorFactory: (params) => new ObjectPropertyBlockEditorStore(params),
    type: EditorType.inline,
  },
} satisfies IBlockConfig<IObjectProperty>;
