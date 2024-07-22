import { nanoid } from 'nanoid';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { SchemeStore } from '../../store/Scheme.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { ForEachIconStore } from './ForEach.icon.store';

export interface IForEachTransformerParams extends IconTransformerParams<IconWithSkewerDto> {
}

export class ForEachTransformer extends IconTransformer<IconWithSkewerDto, ForEachIconStore> {

  constructor(params: IForEachTransformerParams) {
    super(params);
  }

  create(scheme: SchemeStore): ForEachIconStore {
    const id = nanoid();
    const store = new ForEachIconStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      children: [],
      id,
      scheme,
      transformer: this,
    });
    store.skewer.icons.forEach((icon) => icon.setParentId(store.id))
    return store;
  }

  fromDto(scheme: SchemeStore, dto: IconWithSkewerDto): ForEachIconStore {
    const store = new ForEachIconStore({
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      children: dto.children.map((childDto) => scheme.createIconFromDto(childDto, dto.id)),
      id: dto.id,
      scheme,
      transformer: this,
    });
    store.skewer.icons.forEach((icon) => icon.setParentId(store.id))
    return store;
  }

  toDto(store: ForEachIconStore): IconWithSkewerDto {
    return {
      id: store.id,
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),
      children: store.skewer.icons.map((childIcon) => store.scheme.iconToDto(childIcon)),      
    };
  }
}
