import { checker } from '@falang/editor-scheme';
import { IconStore } from '@falang/editor-scheme';
import { FunctionHeaderBlockStore } from '../../blocks/function-header/FunctionHeader.block.store';

export const getParentFunctionIconBlock = (icon: IconStore): FunctionHeaderBlockStore => {
  const parent = icon.parent;
  if (!parent) throw new Error('Function node not found');
  if (checker.isFunction(parent)) return parent.block as FunctionHeaderBlockStore;
  return getParentFunctionIconBlock(parent);
}