import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import type { TChoiceHeaderData } from '@falang/workflow-integrations-common';
import { ChoiceEditorStore } from './choice-editor.store.js';
import { ChoiceHeaderBlockComponent } from './choice-header-view.cmp.js';
import { ChoiceHeaderSidebarComponent } from './choice-header-sidebar.cmp.js';

/**
 * One block config shared by every vendor's structured-choice node kind — always a sidebar editor
 * (never inline/configurable), since it edits both the header's own fields and the alias+dataType
 * option list that drives its `<name>-option` children. See `ChoiceEditorStore`.
 */
export const choiceHeaderBlockConfig = {
  view: ChoiceHeaderBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    type: EditorType.sidebar,
    view: ChoiceHeaderSidebarComponent,
    editorFactory: (params) => new ChoiceEditorStore(params),
  },
} satisfies IBlockConfig<TChoiceHeaderData>;
