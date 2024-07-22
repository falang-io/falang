import { nanoid } from 'nanoid';
import { OutStore } from '../../common/outs/Out.store';
import { OutTransformer } from '../../common/outs/Out.transformer';
import { SchemeStore } from '../../store/Scheme.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { SwitchOptionDto } from './SwitchOption.dto';
import { SwitchOptionStore } from './SwitchOption.store';

export interface ISwitchOptionTransformerParams extends IconTransformerParams<SwitchOptionDto> {
  outTransformer: OutTransformer,
}

export class SwitchOptionTransformer extends IconTransformer<SwitchOptionDto, SwitchOptionStore> {

  outTransformer: OutTransformer;

  constructor(params: ISwitchOptionTransformerParams) {
    super(params);
    this.outTransformer = params.outTransformer;
  }

  create(scheme: SchemeStore): SwitchOptionStore {
    const id = nanoid();
    const store = new SwitchOptionStore({
      alias: 'system',
      block: this.blockTransformer.create(scheme, id),
      children: [],
      id,
      scheme,
      transformer: this,
    });
    store.skewer.icons.forEach((icon) => icon.setParentId(store.id))
    return store;
  }

  fromDto(scheme: SchemeStore, dto: SwitchOptionDto): SwitchOptionStore {
    let outStore: OutStore | undefined;
    if(dto.out) {
      outStore = this.outTransformer.fromDto(scheme, dto.out)
    }
    const store = new SwitchOptionStore({
      alias: 'system',
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      children: dto.children.map((childDto) => scheme.createIconFromDto(childDto, dto.id)),
      id: dto.id,
      scheme,
      out: outStore,
      transformer: this,
    });
    return store;
  }

  toDto(store: SwitchOptionStore): SwitchOptionDto {
    const returnValue: SwitchOptionDto = {
      alias: 'system',
      block: this.blockTransformer.toDto(store.block),
      children: store.skewer.icons.map((childIcon) => store.scheme.iconToDto(childIcon)),
      id: store.id,
    };
    if(store.skewer.outStore) {
      returnValue.out = this.outTransformer.toDto(store.skewer.outStore);
    }
    return returnValue;
  }
}
