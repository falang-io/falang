import { nanoid } from 'nanoid';
import { BlockTransformer, EmptyBlockTransformer } from '../../common/blocks/Block.transformer';
import { EmptyBlockStore } from '../../common/blocks/store/EmptyBlockStore';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { IconWithSkewerStore } from '../../common/skewer/IconWithSkewer.store';
import { OutTransformer } from '../../common/outs/Out.transformer';
import { SchemeStore } from '../../store/Scheme.store';
import { EmptyIconTransformer } from '../base/EmptyIcon.transformer';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { IfIconDto } from './If.icon.dto';
import { IfIconStore } from './If.icon.store';
import { IfOptionStore } from './IfOption.store';

export interface IfIconTransformerParams extends IconTransformerParams<IfIconDto> {
  outTransformer: OutTransformer
  emptyBlockTransformer?: BlockTransformer,
}

export class IfIconTransformer extends IconTransformer<IfIconDto, IfIconStore> {
  outTransformer: OutTransformer
  emptyBlockTransformer: BlockTransformer

  constructor(params: IfIconTransformerParams) {
    super(params);
    this.outTransformer = params.outTransformer;
    this.emptyBlockTransformer = params.emptyBlockTransformer ?? EmptyBlockTransformer.getTransformer();
  }

  create(scheme: SchemeStore): IfIconStore {
    const id = nanoid();
    const id1 = nanoid();
    const id2 = nanoid();
    const store = new IfIconStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      id,
      scheme,
      children: [
        new IfOptionStore({
          alias: 'system',
          block: this.emptyBlockTransformer.create(scheme, id1),
          children: [],
          id: id1,
          scheme,
          transformer: EmptyIconTransformer.getTransformer(),
        }),
        new IfOptionStore({
          alias: 'system',
          block: this.emptyBlockTransformer.create(scheme, id2),
          children: [],
          id: id2,
          scheme,
          transformer: EmptyIconTransformer.getTransformer(),
        })
      ],
      editable: false,
      trueOnRight: true,
      transformer: this,
      gaps: [],
    });
    return store;
  }

  fromDto(scheme: SchemeStore, dto: IfIconDto): IfIconStore {
    const firstOption = new IfOptionStore({
      alias: 'system',
      leftSide: this.getLeftSide(scheme, dto),
      block: this.emptyBlockTransformer.create(scheme, dto.children[0].id),
      children: dto.children[0].children.map((childDto) => scheme.createIconFromDto(childDto, dto.id)),
      id: dto.children[0].id,
      scheme,
      transformer: EmptyIconTransformer.getTransformer(),
    });
    const secondOption = new IfOptionStore({
      alias: 'system',
      block: this.emptyBlockTransformer.create(scheme, dto.children[1].id),
      children: dto.children[1].children.map((childDto) => scheme.createIconFromDto(childDto, dto.id)),
      id: dto.children[1].id,
      scheme,
      transformer: EmptyIconTransformer.getTransformer(),
    })
    const store = new IfIconStore({
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      id: dto.id,
      scheme,
      children: [
        firstOption,
        secondOption,
      ],
      editable: false,
      trueOnRight: dto.trueOnRight,
      transformer: this,
      gaps: dto.gaps,
    });
    store.threads.icons.forEach((icon) => icon.setParentId(dto.id));
    const firstOut = dto.children[0].out;
    const secondOut = dto.children[1].out;
    if(firstOut) {
      firstOption.skewer.setOutStore(this.outTransformer.fromDto(scheme, firstOut));
    }
    if(secondOut) {
      secondOption.skewer.setOutStore(this.outTransformer.fromDto(scheme, secondOut));
    }
    return store;
  }

  toDto(store: IfIconStore): IfIconDto {
    const firstStore = store.threads.icons[0] as IconWithSkewerStore;
    const secondStore = store.threads.icons[1] as IconWithSkewerStore;
    const firstDto: IconWithSkewerDto = {
      alias: 'system',
      id: store.threads.icons[0].id,
      block: { width: 0 },
      children: store.threads.icons[0].skewer.icons.map((child) => store.scheme.iconToDto(child)),
    };
    if(firstStore.skewer.outStore) {
      firstDto.out = this.outTransformer.toDto(firstStore.skewer.outStore);
    }
    const secondDto: IconWithSkewerDto = {
      alias: 'system',
      id: store.threads.icons[1].id,
      block: { width: 0 },
      children: store.threads.icons[1].skewer.icons.map((child) => store.scheme.iconToDto(child)),
    };
    if(secondStore.skewer.outStore) {
      secondDto.out = this.outTransformer.toDto(secondStore.skewer.outStore);
    }

    const returnValue: IfIconDto = {
      id: store.id,
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),      
      trueOnRight: store.trueOnRight,
      gaps: store.threads.gaps,
      children: [firstDto, secondDto],
    };
  
    if(this.leftSideTransformer && store.leftSideStore) {
      returnValue.leftSide = this.leftSideTransformer.toDto(store.leftSideStore);
    }

    return returnValue;
  }
}
