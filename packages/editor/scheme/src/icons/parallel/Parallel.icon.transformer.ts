import { nanoid } from 'nanoid';
import { BlockDto } from '../../common/blocks/Block.dto';
import { BlockTransformer, EmptyBlockTransformer } from '../../common/blocks/Block.transformer';
import { EmptyBlockStore } from '../../common/blocks/store/EmptyBlockStore';
import { IInfrastructureConfig } from '../../infrastructure/IInfrastructureConfig';
import { InfrastructureType } from '../../infrastructure/InfrastructureType';
import { SchemeStore } from '../../store/Scheme.store';
import { EmptyIconTransformer } from '../base/EmptyIcon.transformer';
import { IconDto } from '../base/Icon.dto';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { ParallelDto, ParallelThreadDto, ParallelThreadIconDto } from './Parallel.icon.dto';
import { ParallelIconStore } from './Parallel.icon.store';
import { ParallelThreadIconStore } from './ParallelThread.icon.store';

export interface IParallelTransformerParams {  
  alias?: string
  emptyBlockTransformer?: BlockTransformer
  threadEmptyBlockTransformer?: BlockTransformer
}

export class ParallelIconTransformer extends IconTransformer<ParallelDto, ParallelIconStore> {
  readonly threadTransformer: ParallelThreadIconTransformer;
  readonly isParallelIconTransformer = true;

  constructor(params: IParallelTransformerParams) {
    const blockTransformer = params.emptyBlockTransformer ?? EmptyBlockTransformer.getTransformer();    
    super({
      alias: params.alias ?? 'parallel',
      blockTransformer,
      dtoConstructor: ParallelDto,
    });
    const threadBlockTransformer = params.threadEmptyBlockTransformer ?? EmptyBlockTransformer.getTransformer();
    this.threadTransformer = new ParallelThreadIconTransformer(threadBlockTransformer);
  }

  create(scheme: SchemeStore): ParallelIconStore {
    const id = nanoid();
    const store = new ParallelIconStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      children: [
        this.threadTransformer.create(scheme),
        this.threadTransformer.create(scheme),
      ],
      editable: true,
      id,
      scheme,
      transformer: this,
      gaps: [],
    });
    return store;
  }

  fromDto(scheme: SchemeStore, dto: ParallelDto): ParallelIconStore {
    const store = new ParallelIconStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, dto.id),
      children: dto.children.map((childDto) => this.threadTransformer.fromThreadDto(scheme, childDto)),
      editable: true,
      id: dto.id,
      scheme,
      transformer: this,
      gaps: dto.gaps,
    });
    store.threads.icons.forEach((icon) => icon.setParentId(store.id))
    return store;
  }

  toDto(store: ParallelIconStore): ParallelDto {
    return {
      id: store.id,
      alias: this.alias,
      block: { width: 100 },
      gaps: store.threads.gaps,
      children: store.threads.icons.map((childIcon) => this.threadTransformer.toThreadDto(childIcon)),            
    };
  }
}

export class ParallelThreadIconTransformer extends IconTransformer<ParallelThreadIconDto, ParallelThreadIconStore> {
  constructor(blockTransformer?: BlockTransformer) {
    super({
      alias: 'system',
      blockTransformer: blockTransformer ?? EmptyBlockTransformer.getTransformer(),
      dtoConstructor: ParallelThreadIconDto,
    });
  }

  create(scheme: SchemeStore): ParallelThreadIconStore {
    const id = nanoid();
    return new ParallelThreadIconStore({
      alias: 'system',
      block: this.blockTransformer.create(scheme, id),
      children: [],
      id,
      scheme,
      transformer: this,
    });
  }
  fromThreadDto(scheme: SchemeStore, dto: ParallelThreadDto) {
    return this.fromDto(scheme, {
      alias: 'system',
      block: { width: 0},
      children: dto.children,
      id: dto.id,
    })
  }
  fromDto(scheme: SchemeStore, dto: ParallelThreadIconDto): ParallelThreadIconStore {
    return new ParallelThreadIconStore({
      alias: 'system',
      block: this.blockTransformer.create(scheme, dto.id),
      children: dto.children.map(ch => scheme.createIconFromDto(ch, null)),
      id: dto.id,
      scheme,
      transformer: EmptyIconTransformer.getTransformer(),
    });
  }
  toDto(store: ParallelThreadIconStore): ParallelThreadIconDto {
    return {
      alias: 'system',
      block: { width: 0 },
      children: store.skewer.icons.map((icon) => store.scheme.iconToDto(icon)),
      id: store.id
    }
  }
  toThreadDto(store: ParallelThreadIconStore): ParallelThreadDto {
    return {
      id: store.id,
      children: this.toDto(store).children,      
    }
  }
}