import { EmptyBlockStore } from '../../common/blocks/store/EmptyBlockStore';
import { generateId } from '../../common/generateId';
import { SchemeStore } from '../../store/Scheme.store';
import { EmptyIconTransformer } from './EmptyIcon.transformer';
import { IconStore } from './Icon.store';

export class EmptyLineIconStore extends IconStore {
  constructor(scheme: SchemeStore) {
    const id = generateId();
    super({
      alias: 'system-empty-line',
      block: new EmptyBlockStore({ scheme }),
      id,
      scheme,
      transformer: EmptyIconTransformer.getTransformer(),
    });
  }
}