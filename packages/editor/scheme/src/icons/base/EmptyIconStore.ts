import { EmptyBlockTransformer } from '../../common/blocks/Block.transformer';
import { BlockStore } from '../../common/blocks/store/BlocksStore';
import { CELL_SIZE } from '../../common/constants';
import { generateId } from '../../common/generateId';
import { SchemeStore } from '../../store/Scheme.store';
import { EmptyIconTransformer } from './EmptyIcon.transformer';
import { IconStore } from './Icon.store';

export class EmptyIconStore extends IconStore {
  constructor(scheme: SchemeStore) {
    const id = generateId();
    super({
      alias: 'system-empty',
      block: new BlockStore({
        id,
        scheme,
        width: CELL_SIZE,
        transformer: new EmptyBlockTransformer(''),
      }),
      id,
      scheme,
      transformer: EmptyIconTransformer.getTransformer(),
    });
  }
}