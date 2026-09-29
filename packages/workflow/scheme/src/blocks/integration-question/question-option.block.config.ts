import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2 } from '@falang/scheme';
import { QuestionOptionBlockComponent } from './question-option-view.cmp.js';

interface IQuestionOptionData {
  readonly label: string;
}

/** No `editor` — an option's label is set programmatically by the header's sidebar, never edited directly (see `QuestionEditorStore.syncOptionChildren`). */
export const questionOptionBlockConfig = {
  view: QuestionOptionBlockComponent,
  minHeight: CELL_SIZE_2,
} satisfies IBlockConfig<IQuestionOptionData>;
