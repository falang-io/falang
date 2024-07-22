import { CELL_SIZE } from '@falang/editor-scheme';
import { TTypeInfo } from '../constants'

export const getInlineTypeHeight = (typeInfo: TTypeInfo | null): number => {
  if(typeInfo === null) return 0;
  return typeInfo.type === 'array' ? CELL_SIZE * 2 : CELL_SIZE;
};
