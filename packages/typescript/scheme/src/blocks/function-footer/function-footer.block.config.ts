import type { IBlockConfig, IIconConfig } from '@falang/scheme';
import { BaseIconComponent, CELL_SIZE_2, CELL_SIZE_4 } from '@falang/scheme';
import { FunctionFooterBlockComponent } from './function-footer.block.cmp.js';
import { FunctionFooterIconStore } from './function-footer.icon.store.js';

/** A fixed "End" label: no editor, not resizable; the node's stored `data` is ignored. */
export const functionFooterBlockConfig = {
  view: FunctionFooterBlockComponent,
  minHeight: CELL_SIZE_2,
  defaultWidth: CELL_SIZE_4,
  resizable: false,
} satisfies IBlockConfig;

export const functionFooterIconConfig = {
  factory: (params) => new FunctionFooterIconStore(params),
  view: BaseIconComponent,
} as const satisfies IIconConfig<FunctionFooterIconStore>;
