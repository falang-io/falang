import { nanoid } from 'nanoid';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { SchemeStore } from '../../store/Scheme.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { WhileDto } from './While.dto';
import { WhileStore } from './While.store';

export interface IWhileTransformerParams extends IconTransformerParams<WhileDto> {
}

export class WhileTransformer extends IconTransformer<WhileDto, WhileStore> {

  constructor(params: IWhileTransformerParams) {
    super(params);
  }

  create(scheme: SchemeStore): WhileStore {
    const id = nanoid();
    const store = new WhileStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      children: [],
      id,
      scheme,
      trueIsMain: true,
      transformer: this,
    });
    store.skewer.icons.forEach((icon) => icon.setParentId(store.id))
    return store;
  }

  fromDto(scheme: SchemeStore, dto: WhileDto): WhileStore {
    const store = new WhileStore({
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id, dto),
      children: dto.children.map((childDto) => scheme.createIconFromDto(childDto, dto.id)),
      id: dto.id,
      scheme,
      trueIsMain: (typeof dto.trueIsMain === 'boolean') ? dto.trueIsMain : true,
      transformer: this,
    });
    store.skewer.icons.forEach((icon) => icon.setParentId(store.id))
    return store;
  }

  toDto(store: WhileStore): WhileDto {
    return {
      id: store.id,
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),
      trueIsMain: store.trueIsMain,
      children: store.skewer.icons.map((childIcon) => store.scheme.iconToDto(childIcon)),            
    };
  }
}
