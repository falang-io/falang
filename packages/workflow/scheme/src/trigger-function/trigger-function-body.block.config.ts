import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2 } from '@falang/scheme';
import type { TTriggerFunctionBodyData } from '@falang/workflow-dto';
import { TriggerFunctionBodyBlockComponent } from './trigger-function-body-block.cmp.js';

/** No `editor` — which trigger this function is bound to is fixed at creation, not user-editable here. */
export const triggerFunctionBodyBlockConfig = {
  view: TriggerFunctionBodyBlockComponent,
  minHeight: CELL_SIZE_2,
} satisfies IBlockConfig<TTriggerFunctionBodyData>;
