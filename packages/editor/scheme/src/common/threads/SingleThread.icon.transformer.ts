import { nanoid } from 'nanoid';
import { IconTransformer, IconTransformerParams } from '../../icons/base/Icon.transformer';
import { SchemeStore } from '../../store/Scheme.store';
import { IconWithSkewerDto } from '../skewer/IconWithSkewer.dto';
import { IconWithSkewerStore } from '../skewer/IconWithSkewer.store';
import { SingleThreadIconStore } from './SignleThreadIcon.store';
import { OutTransformer } from '../outs/Out.transformer';

export interface ISingleThreadIconTransformerParams extends IconTransformerParams<IconWithSkewerDto> {
  outTransformer: OutTransformer,
}

export class SingleThreadIconTransformer extends IconTransformer<IconWithSkewerDto, SingleThreadIconStore> {

  readonly outTransformer: OutTransformer;

  constructor(params: ISingleThreadIconTransformerParams) {
    super(params);
    this.outTransformer = params.outTransformer;
  }

  create(scheme: SchemeStore): SingleThreadIconStore {
    const id = nanoid();
    const store = new SingleThreadIconStore({
      alias: 'system',
      block: this.blockTransformer.create(scheme, id),
      children: [],
      id,
      scheme,
      transformer: this,
    });
    return store;
  }

  fromDto(scheme: SchemeStore, dto: IconWithSkewerDto): SingleThreadIconStore {
    const store = new SingleThreadIconStore({
      alias: 'system',
      block: this.blockTransformer.fromDto(scheme, dto, dto.id),
      children: dto.children.map((dto) => scheme.createIconFromDto(dto, dto.id)),
      id: dto.id,
      scheme,
      out: dto.out ? this.outTransformer.fromDto(scheme, dto.out) : undefined,
      transformer: this,
    });
    return store;
  }
  
  toDto(store: SingleThreadIconStore): IconWithSkewerDto {
    const dto: IconWithSkewerDto = {
      alias: 'system',
      block: this.blockTransformer.toDto(store.block),
      children: store.skewer.icons.map(icon => store.scheme.iconToDto(icon)),
      id: store.id,
    }
    if(store.skewer.outStore) {
      dto.out = this.outTransformer.toDto(store.skewer.outStore)
    }
    return dto;
  }


}