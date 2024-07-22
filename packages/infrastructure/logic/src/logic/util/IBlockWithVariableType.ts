import { BlockStore } from '@falang/editor-scheme';
import { TVariableInfo } from '../constants';

/**
 * @deprecated
 */
export interface IBlockWithVariableType extends BlockStore {
  variableType: TVariableInfo | null;
  setVariableType: (type: TVariableInfo) => void;
}

/**
 * @deprecated
 */
export interface IBlockWithVariableTypeComponentParams {
  block: IBlockWithVariableType,
  x: number
  y: number
  width: number
}