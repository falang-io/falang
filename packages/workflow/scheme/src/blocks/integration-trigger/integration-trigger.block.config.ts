import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2 } from '@falang/scheme';
import { IntegrationTriggerBlockComponent } from './integration-trigger-block.cmp.js';

/** Shared by every trigger node of every registered vendor — no `editor`, see the view component's note. */
export const integrationTriggerBlockConfig = {
  view: IntegrationTriggerBlockComponent,
  minHeight: CELL_SIZE_2,
  resizable: false,
} satisfies IBlockConfig<undefined>;
