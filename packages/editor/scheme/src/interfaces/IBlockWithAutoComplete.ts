import { BlockStore } from '../common/blocks/store/BlocksStore';

export type AutocompleteOption = {
  text: string;
  toInsert: string;
  comment: string;
};

export interface IBlockWithAutoComplete extends BlockStore {
  getAutoComplete(code: string, index: number): AutocompleteOption[];
}

