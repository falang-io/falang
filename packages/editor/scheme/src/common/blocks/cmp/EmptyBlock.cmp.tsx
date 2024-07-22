import { TBlockComponent } from '../Block.transformer';
import { BlockStore } from '../store/BlocksStore';

export const EmptyBlockComponent: TBlockComponent<any> = () => {
  return <></>;
}