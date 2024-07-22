import { nanoid } from 'nanoid';
import { SchemeStore } from '../../store/Scheme.store';
import { IconDto } from '../base/Icon.dto';
import { IconTransformer } from '../base/Icon.transformer';
import { IconStore } from './Icon.store';

export class IconStoreWithBlockTransformer extends IconTransformer<IconDto, IconStore> {

  create(scheme: SchemeStore): IconStore {
    const id = nanoid();
    return new IconStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      id,
      scheme,
      transformer: this,
    });
  }

  fromDto(scheme: SchemeStore, dto: IconDto): IconStore {
    return new IconStore({
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      id: dto.id,
      scheme,
      transformer: this,
    });
  }

  toDto(store: IconStore): IconDto {
    return {
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),
      id: store.id,
    }
  }
}
