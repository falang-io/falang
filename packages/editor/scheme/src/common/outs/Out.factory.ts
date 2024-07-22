/*import { runInAction } from 'mobx';
import { nanoid } from 'nanoid';
import { BlockDto, BlockStore, IBlockTranformer } from '../blocks';
import { IconWithSkewerStore } from '../common';
import { SchemeStore } from '../scheme';
import { TDtoFactory, TextBlockDto, TIconConfig } from '../scheme-infrastructure';
import { IOutDto, outDtoFactory } from './Out.dto';
import { OutStore, TOutType } from './Out.store';

export interface IIconWithOutDto<TBD extends BlockDto = BlockDto> {
  out?: IOutDto<TBD>
}

export interface IOutConfigFactoryParams<
  TBD extends BlockDto = BlockDto,
  TBlock extends BlockStore<TBD> = BlockStore<TBD>,
> {
  blockTransformer: IBlockTranformer<TBlock, TBD>
}

export interface IOutConfig<
  TBD extends BlockDto = BlockDto,
  TBlock extends BlockStore<TBD> = BlockStore<TBD>,
> {
  set(icon: IconWithSkewerStore, type: TOutType, level?: number): void;
  remove(icon: IconWithSkewerStore): void;
  fromDto(scheme: SchemeStore, dto: IIconWithOutDto<TBD>, parentId: string): OutStore<TBlock> | null;
  toDto(icon: IconWithSkewerStore): IIconWithOutDto<TBD>
}

export const createOutConfigFactory = <
  TBD extends BlockDto = BlockDto,
  TBlock extends BlockStore<TBD> = BlockStore<TBD>,
>({ blockTransformer }: IOutConfigFactoryParams<TBD, TBlock>) => {
  const config: IOutConfig<TBD, TBlock> = {
    set(icon: IconWithSkewerStore, type: TOutType, level?: number): void {
      runInAction(() => {
        if (icon.outStore) {
          const oldStore = icon.outStore;
          icon.outStore = null;
          oldStore.dispose();
        }
        const id = nanoid();
        const outStore = new OutStore({
          type,
          outLevel: level,
          alias: 'system',
          block: blockTransformer.create(icon.scheme, id),
          id,
          parentId: icon.id,
          scheme: icon.scheme,
        });
        icon.outStore = outStore;
        setTimeout(() => runInAction(() => {
          outStore.initShape();  
        }), 10);                
      });
    },
    remove(icon: IconWithSkewerStore): void {
      runInAction(() => {
        const outStore = icon.outStore;
        if (!outStore) return;
        icon.outStore = null;
        outStore.dispose();
      });
    },
    fromDto(scheme, iconDto, parentId) {
      const dto = iconDto.out;
      if (!dto) return null;
      const id = nanoid();
      const outStore = new OutStore({
        type: dto.type,
        outLevel: dto.level,
        alias: 'system',
        block: dto.block ?  blockTransformer.fromDto(scheme, dto.block, id) : blockTransformer.create(scheme, id),
        id,
        parentId,
        scheme,
      });
      setTimeout(() => runInAction(() => {
        outStore.initShape();  
      }), 10);
      return outStore;
    },
    toDto(icon) {
      const out = icon.outStore;
      if (!out) return {};
      const dto: IOutDto<TBD> = {
        type: out.type
      }
      if (out.type === 'return' && out.block) {
        dto.block = blockTransformer.toDto(out.block as TBlock)
      }
      if (out.type !== 'return' && out.outLevel > 1) {
        dto.level = out.outLevel;
      }
      return { out: dto };
    },
  };
  return config;
  /*const config: TIconConfig<TBD, OutStore<TBlock>, 'system', any, OutStore> = {
    alias: 'system',
    context: 'system',
    createEmpty: ({ scheme, parentId }) => {
      throw new Error('Not for create');
    },
    dtoFactory: outDtoFactory({
      blockDtoFactory: () => TextBlockDto
    }),
    fromDto: ({ scheme, config, dto, parentId }) => {
      const d = dto as IOutDto<TBD>;
      const id = nanoid();
      return new OutStore({
        alias: 'system',
        block: d.block ? blockTransformer.fromDto(scheme, dto, id) : blockTransformer.create(scheme, id),
        id,
        parentId,
        scheme,
        type: d.type,
        outLevel: d.level,
      })
    },
    iconType: OutStore,
    renderer: () => null,
    toDto: () => { },
  }
  return config;
};
*/
export {};