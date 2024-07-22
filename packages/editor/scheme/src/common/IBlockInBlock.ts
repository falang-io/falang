import { BlockStore } from './blocks/store/BlocksStore';

export interface IBlockInBlock<T> {
  getRenderer(): React.FC<{ store: T }>
  getEditor(): React.FC<{ store: T, blockStore?: BlockStore }>
  getBackground(): React.FC<{ store: T }>
  dispose(): void;
  getErrors(): string[];
}
