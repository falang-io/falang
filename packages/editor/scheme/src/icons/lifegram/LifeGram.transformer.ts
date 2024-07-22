import { nanoid } from 'nanoid';
import { IInfrastructureConfig } from '../../infrastructure/IInfrastructureConfig';
import { InfrastructureType } from '../../infrastructure/InfrastructureType';
import { SchemeStore } from '../../store/Scheme.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { LifegramDto, LifegramFunctionDto } from './Lifegram.dto';
import { LifeGramIconStore } from './LifeGram.icon.store';
import { LifeGramFinishIconStore } from './LifeGramFinish.icon.store';
import { BlockTransformer, EmptyBlockTransformer } from '../../common/blocks/Block.transformer';
import { IconStore } from '../base/Icon.store';
import { LifegramFunctionIconStore } from './LifeGramFunction.icon.store';
import { LifegramReturnIconStore } from './LifegramReturnIcon.store';
import { ThreadsIconStore } from '../../common/threads/ThreadsIconStore';
import { EmptyBlockStore } from '../../common/blocks/store/EmptyBlockStore';
import { BlockDto } from '../../common/blocks/Block.dto';
import { IconDto } from '../base/Icon.dto';
import { EmptyIconTransformer } from '../base/EmptyIcon.transformer';
import { EmptyIconStore } from '../base/EmptyIconStore';
import { FunctionIconDto } from '../function/Function.icon.dto';

export interface ILifegramTransformerParams extends IconTransformerParams<LifegramDto> {
  finishBlockTransformer?: BlockTransformer<any>
  headerBlockTransformer?: BlockTransformer<any>
  returnBlockTransformer?: BlockTransformer<any>
  functionBlockTrnsformer?: BlockTransformer<any>
  finishStartBlockTransformer?: BlockTransformer<any>
  functionFooterBlockTransformer?: BlockTransformer<any>
}


export class LifegramTransformer extends IconTransformer<LifegramDto, LifeGramIconStore> {
  finishBlockTransformer: BlockTransformer<any>
  headerBlockTransformer: BlockTransformer<any>
  returnBlockTransformer: BlockTransformer<any>
  functionBlockTransformer: BlockTransformer<any>
  finishStartBlockTransformer: BlockTransformer<any>
  functionIconTransformer: LifeGramFunctionIconTransformer;
  functionFooterBlockTransformer: BlockTransformer<any>
  readonly isLifeGramTransformer = true;

  constructor(params: ILifegramTransformerParams) {
    super(params);
    this.finishBlockTransformer = params.finishBlockTransformer ?? params.blockTransformer;
    this.headerBlockTransformer = params.headerBlockTransformer ?? params.blockTransformer;
    this.functionBlockTransformer = params.functionBlockTrnsformer ?? params.blockTransformer;
    this.returnBlockTransformer = params.returnBlockTransformer ?? params.blockTransformer;
    this.finishStartBlockTransformer = params.finishStartBlockTransformer ?? params.blockTransformer;
    this.functionFooterBlockTransformer = params.functionFooterBlockTransformer ?? EmptyBlockTransformer.getTransformer();
    this.functionIconTransformer = new LifeGramFunctionIconTransformer({
      alias: 'system',
      blockTransformer: this.functionBlockTransformer,
      dtoConstructor: LifegramFunctionDto,
      returnBlockTransformer: this.returnBlockTransformer,
      functionFooterBlockTransformer: this.functionFooterBlockTransformer 
    })
  }

  create(scheme: SchemeStore): LifeGramIconStore {
    const id = nanoid();
    const footerFinishId = nanoid();
    const finishId = nanoid();
    const headerId = nanoid();
    return new LifeGramIconStore({
      id,
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      finish: new LifeGramFinishIconStore({
        id: finishId,
        block: this.finishStartBlockTransformer.create(scheme, finishId),
        scheme,
        children: [],
        footer: new IconStore({
          block: this.finishBlockTransformer.create(scheme, footerFinishId),
          id: footerFinishId,
          scheme,
          transformer: EmptyIconTransformer.getTransformer()
        }),
        transformer: EmptyIconTransformer.getTransformer()
      }),
      functions: [
        this.functionIconTransformer.create(scheme),
        this.functionIconTransformer.create(scheme),
      ],
      header: new IconStore({
        id: headerId,
        block: this.headerBlockTransformer.create(scheme, headerId),
        scheme,
        transformer: EmptyIconTransformer.getTransformer()
      }),
      scheme,
      transformer: this,
      gaps: [],
    })
  }
  fromDto(scheme: SchemeStore, dto: LifegramDto): LifeGramIconStore {
    const footerFinishId = nanoid();
    const headerId = nanoid();
    return new LifeGramIconStore({
      id: dto.id,
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      finish: new LifeGramFinishIconStore({
        id: dto.finish.id,
        footer: new IconStore({
          block: this.finishBlockTransformer.fromDto(scheme, dto.finish.return, footerFinishId),
          id: footerFinishId,
          scheme,
          transformer: EmptyIconTransformer.getTransformer(),
        }),
        block: this.finishStartBlockTransformer.fromDto(scheme, dto.finish.block, dto.finish.id, dto.finish),
        scheme,
        children: dto.finish.children.map((childDto) => scheme.createIconFromDto(childDto, dto.finish.id)),
        transformer: EmptyIconTransformer.getTransformer(),
      }),
      functions: dto.functions.map((funcDto) => {
        return this.functionIconTransformer.fromDto(scheme, funcDto)
      }),
      header: new IconStore({
        id: headerId,
        block: this.headerBlockTransformer.fromDto(scheme, dto.headerBlock, headerId, dto),
        scheme,
        transformer: EmptyIconTransformer.getTransformer(),
      }),
      scheme,
      transformer: this,
      gaps: dto.gaps,
    })
  }

  toDto(store: LifeGramIconStore): LifegramDto {
    const returnValue: LifegramDto = {
      id: store.id,
      alias: store.alias,
      headerBlock: this.headerBlockTransformer.toDto(store.header.block),
      block: this.blockTransformer.toDto(store.block),      
      gaps: store.threads.gaps,
      finish: {
        id: store.finish.id,
        alias: 'system',
        block: this.finishBlockTransformer.toDto(store.finish.block),
        children: store.finish.skewer.icons.map(icon => store.scheme.iconToDto(icon)),
        return: this.returnBlockTransformer.toDto(store.finish.footer.block),
      },
      functions: store.threads.icons.map((icon) => {
        const returnValue: LifegramFunctionDto = {
          id: icon.id,
          alias: 'system',
          block: this.functionBlockTransformer.toDto(icon.block),
          returnGaps: (icon.footer as ThreadsIconStore<LifegramReturnIconStore>).threads.gaps,
          children: icon.skewer.icons.map(childIcon => store.scheme.iconToDto(childIcon)),          
          returns: (icon.footer as ThreadsIconStore<LifegramReturnIconStore>).threads.icons.map(icon => this.returnBlockTransformer.toDto(icon.block)),          
        };
        return returnValue;
      }),
    };
    return returnValue;
  }
}

export interface ILifegramFunctionTransformerParams extends IconTransformerParams<LifegramFunctionDto> {
  returnBlockTransformer?: BlockTransformer<any>
  functionFooterBlockTransformer: BlockTransformer
}

export class LifeGramFunctionIconTransformer extends IconTransformer<LifegramFunctionDto, LifegramFunctionIconStore> {
  private readonly returnBlockTransformer: BlockTransformer<any>
  readonly returnTransformer: ReturnIconTransformer;
  readonly functionFooterBlockTransformer: BlockTransformer;
  constructor(params: ILifegramFunctionTransformerParams) {
    super(params);
    this.functionFooterBlockTransformer = params.functionFooterBlockTransformer ?? EmptyBlockTransformer.getTransformer()
    this.returnBlockTransformer = params.returnBlockTransformer ?? params.blockTransformer;
    this.returnTransformer = new ReturnIconTransformer({
      alias: 'system',
      blockTransformer: this.returnBlockTransformer,
      dtoConstructor: IconDto,
    })
  }


  create(scheme: SchemeStore): LifegramFunctionIconStore {
    const id = nanoid();
    return new LifegramFunctionIconStore({
      id,
      scheme,
      block: this.blockTransformer.create(scheme, id),
      children: [],
      header: new EmptyIconStore(scheme),
      returns: [this.returnTransformer.create(scheme)],
      transformer: this,
      returnGaps: [],
      footerBlockTransformer: this.functionFooterBlockTransformer,
    });
  }
  fromDto(scheme: SchemeStore, funcDto: LifegramFunctionDto): LifegramFunctionIconStore {
    const headerId = nanoid();
    return new LifegramFunctionIconStore({
      block: this.blockTransformer.fromDto(scheme, funcDto.block, funcDto.id),
      id: funcDto.id,
      children: funcDto.children.map((funcChildDto) => scheme.createIconFromDto(funcChildDto, funcDto.id)),
      header: new IconStore({
        scheme,
        block: new EmptyBlockStore({ scheme, id: headerId }),
        id: headerId,
        transformer: EmptyIconTransformer.getTransformer(),
      }),
      returns: funcDto.returns.map((returnDto) => {
        const returnId = nanoid();
        return this.returnTransformer.fromDto(scheme, {
          id: returnId,
          alias: nanoid(),
          block: returnDto,
        });
      }),
      scheme,
      transformer: this,
      returnGaps: funcDto.returnGaps,
      footerBlockTransformer: this.functionFooterBlockTransformer,
    });
  }
  toDto(icon: LifegramFunctionIconStore): LifegramFunctionDto {
    const returnValue: LifegramFunctionDto = {
      id: icon.id,
      alias: 'system',
      block: this.blockTransformer.toDto(icon.block),
      returnGaps: (icon.footer as ThreadsIconStore<LifegramReturnIconStore>).threads.gaps,
      children: icon.skewer.icons.map(childIcon => icon.scheme.iconToDto(childIcon)),      
      returns: (icon.footer as ThreadsIconStore<LifegramReturnIconStore>).threads.icons.map(icon => this.returnTransformer.toDto(icon).block),      
    };
    return returnValue;
  }
}

export class ReturnIconTransformer extends IconTransformer<IconDto, LifegramReturnIconStore> {
  create(scheme: SchemeStore): LifegramReturnIconStore {
    const id = nanoid();
    return new LifegramReturnIconStore({
      id,
      scheme,
      block: this.blockTransformer.create(scheme, id),
      transformer: this,
    })
  }
  fromDto(scheme: SchemeStore, dto: IconDto): LifegramReturnIconStore {
    const returnId = nanoid();
    return new LifegramReturnIconStore({
      id: returnId,
      block: this.blockTransformer.fromDto(scheme, dto.block, returnId),
      scheme,
      transformer: this,
    });
  }
  toDto(store: LifegramReturnIconStore): IconDto {
    const blockDto = this.blockTransformer.toDto(store.block);
    return {
      id: store.id,
      alias: 'system',
      block: blockDto,
    }
  }
}
