import type { IBlockConfig } from '@falang/scheme';
import { CELL_SIZE_2 } from '@falang/scheme';
import { SchemeTitleBlockComponent } from './scheme-title-block.cmp.js';

export const schemeTitleBlockConfig = {
  view: SchemeTitleBlockComponent,
  minHeight: CELL_SIZE_2,
  resizable: false,
} satisfies IBlockConfig<unknown>;
