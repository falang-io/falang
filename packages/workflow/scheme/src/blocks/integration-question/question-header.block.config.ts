import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2, EditorType } from '@falang/scheme';
import type { TQuestionHeaderData } from '@falang/workflow-integrations-common';
import { QuestionEditorStore } from './question-editor.store.js';
import { QuestionHeaderBlockComponent } from './question-header-view.cmp.js';
import { QuestionHeaderSidebarComponent } from './question-header-sidebar.cmp.js';

/**
 * One block config shared by every vendor's question-with-buttons node kind — always a sidebar
 * editor (never inline/configurable), since it edits both the header's own fields and the
 * button-options list that drives its `<name>-option` children. See `QuestionEditorStore`.
 */
export const questionHeaderBlockConfig = {
  view: QuestionHeaderBlockComponent,
  minHeight: CELL_SIZE_2,
  editor: {
    type: EditorType.sidebar,
    view: QuestionHeaderSidebarComponent,
    editorFactory: (params) => new QuestionEditorStore(params),
  },
} satisfies IBlockConfig<TQuestionHeaderData>;
