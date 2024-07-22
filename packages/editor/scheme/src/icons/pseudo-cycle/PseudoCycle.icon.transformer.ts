import { nanoid } from 'nanoid';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { SchemeStore } from '../../store/Scheme.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { PseudoCycleIconStore } from './PseudoCycle.icon.store';

export interface IWhileTransformerParams extends IconTransformerParams<IconWithSkewerDto> {
}

export class PseudoCycleIconTransformer extends IconTransformer<IconWithSkewerDto, PseudoCycleIconStore> {

  constructor(params: IWhileTransformerParams) {
    super(params);
  }

  create(scheme: SchemeStore): PseudoCycleIconStore {
    const id = nanoid();
    const store = new PseudoCycleIconStore({
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

  fromDto(scheme: SchemeStore, dto: IconWithSkewerDto): PseudoCycleIconStore {
    const store = new PseudoCycleIconStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, dto.id),
      children: dto.children.map((childDto) => scheme.createIconFromDto(childDto, dto.id)),
      id: dto.id,
      scheme,
      transformer: this,
    });
    store.skewer.icons.forEach((icon) => icon.setParentId(store.id))
    return store;
  }

  toDto(store: PseudoCycleIconStore): IconWithSkewerDto {
    return {
      id: store.id,
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),
      children: store.skewer.icons.map((childIcon) => store.scheme.iconToDto(childIcon)),      
    };
  }
}
