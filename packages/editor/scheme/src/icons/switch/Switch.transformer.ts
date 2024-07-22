import { nanoid } from 'nanoid';
import { SchemeStore } from '../../store/Scheme.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { SwitchDto } from './Switch.dto';
import { SwitchStore } from './Switch.store';
import { SwitchOptionStore } from './SwitchOption.store';
import { SwitchOptionTransformer } from './SwitchOption.transformer';

export interface ISwitchTransformerParams extends IconTransformerParams<SwitchDto> {
  switchOptionTransformer: SwitchOptionTransformer;
}

export class SwitchTransformer extends IconTransformer<SwitchDto, SwitchStore> {
  readonly switchOptionTransformer: SwitchOptionTransformer;

  readonly isSwitchTransformer = true;

  constructor(params: ISwitchTransformerParams) {
    super(params);
    this.switchOptionTransformer = params.switchOptionTransformer;
  }

  create(scheme: SchemeStore): SwitchStore {
    const id = nanoid();
    const store = new SwitchStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      children: [
        this.switchOptionTransformer.create(scheme),
        this.switchOptionTransformer.create(scheme),
      ],
      editable: true,
      id,
      scheme,
      transformer: this,
      gaps: [],
    });
    return store;
  }

  fromDto(scheme: SchemeStore, dto: SwitchDto): SwitchStore {
    const store = new SwitchStore({
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      children: dto.children.map((childDto) => this.switchOptionTransformer.fromDto(scheme, childDto)),
      editable: true,
      id: dto.id,
      scheme,
      transformer: this,
      gaps: dto.gaps,
      leftSide: this.getLeftSide(scheme, dto),
    });
    store.threads.icons.forEach((icon) => icon.setParentId(store.id))
    return store;
  }

  toDto(store: SwitchStore): SwitchDto {
    const returnValue: SwitchDto = {
      id: store.id,
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),
      gaps: store.threads.gaps,
      children: store.threads.icons.map((childIcon) => this.switchOptionTransformer.toDto(childIcon as SwitchOptionStore)),            
    };
    if(this.leftSideTransformer && store.leftSideStore) {
      returnValue.leftSide = this.leftSideTransformer.toDto(store.leftSideStore);
    }
    return returnValue;
  }
}
