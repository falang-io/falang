import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2 } from '@falang/scheme';
import type { IChoiceOptionData } from '@falang/workflow-integrations-common';
import { ChoiceOptionBlockComponent } from './choice-option-view.cmp.js';

/** No `editor` — an option's alias/dataType is set programmatically by the header's sidebar, never edited directly (see `ChoiceEditorStore`). */
export const choiceOptionBlockConfig = {
  view: ChoiceOptionBlockComponent,
  minHeight: CELL_SIZE_2,
} satisfies IBlockConfig<IChoiceOptionData>;
