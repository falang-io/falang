import type { IBlockConfig } from '../../types/block-config.js';
import { getPseudoBlockComponent } from './pseudo-block.cmp.js';

export const getPseudoBlockConfig = (text: string, width: number): IBlockConfig => ({
  view: getPseudoBlockComponent(text),
  defaultWidth: width,
  resizable: false,
});
