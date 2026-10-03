import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import type { TMagicData } from '@falang/workflow-dto';
import {
  MagicBlockComponent,
  MagicFunctionEndBlockComponent,
  MagicFunctionHeaderBlockComponent,
  MagicFunctionStartBlockComponent,
} from './magic-block.cmp.js';
import { MagicSpellEditorComponent } from './magic-spell-editor.cmp.js';
import { MagicSpellEditorStore } from './magic-spell-editor.store.js';

const spellEditor = {
  view: MagicSpellEditorComponent,
  editorFactory: (params) => new MagicSpellEditorStore(params),
  type: EditorType.inline,
} as const satisfies NonNullable<IBlockConfig<TMagicData>['editor']>;

export const magicBlockConfig = {
  view: MagicBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: spellEditor,
} satisfies IBlockConfig<TMagicData>;

export const magicFunctionHeaderBlockConfig = {
  view: MagicFunctionHeaderBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: spellEditor,
} satisfies IBlockConfig<TMagicData>;

/** No `editor`: the editor never opens on these. */
export const magicFunctionStartBlockConfig = {
  view: MagicFunctionStartBlockComponent,
  minHeight: CELL_SIZE_2,
} satisfies IBlockConfig;

export const magicFunctionEndBlockConfig = {
  view: MagicFunctionEndBlockComponent,
  minHeight: CELL_SIZE_2,
} satisfies IBlockConfig;
