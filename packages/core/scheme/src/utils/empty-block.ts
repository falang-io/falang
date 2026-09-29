import type { IBlockConfig } from '../types/block-config.js';

export const emptyBlockConfig = {
  view: () => null,
  defaultWidth: 0,
  minHeight: 0,
} as const satisfies IBlockConfig;
