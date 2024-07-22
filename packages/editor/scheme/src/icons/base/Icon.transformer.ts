import { IContextMenuItem } from '@falang/frontend-core';
import { ClassConstructor, plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { BlockTransformer } from '../../common/blocks/Block.transformer';
import { BlockStore } from '../../common/blocks/store/BlocksStore';
import { SchemeStore } from '../../store/Scheme.store';
import { ISideIconTransformer } from '../side/ISideIconTransformer';
import { LeftSideIconStore } from '../side/LeftSide.icon.store';
import { IconDto } from './Icon.dto';
import { IconStore } from './Icon.store';
import { IIconWithList } from './IIconList';

export interface IconTransformerParams<TDto extends IconDto = IconDto> {
  dtoConstructor: ClassConstructor<TDto>
  blockTransformer: BlockTransformer<any, any>
  leftSideTransformer?: ISideIconTransformer
  alias: string
}

export abstract class IconTransformer<
  TDto extends IconDto = IconDto,
  TStore extends IconStore = IconStore,  
> {
  readonly dtoConstructor: ClassConstructor<TDto>;
  readonly alias: string;
  readonly blockTransformer: BlockTransformer<any>;
  readonly leftSideTransformer: ISideIconTransformer | null;

  constructor({ dtoConstructor, alias, blockTransformer, leftSideTransformer }: IconTransformerParams<TDto>) {
    this.dtoConstructor = dtoConstructor;
    this.alias = alias;
    this.blockTransformer = blockTransformer;
    this.leftSideTransformer = leftSideTransformer || null;
  }

  async validate(value: any) {
    const instance = plainToClass(this.dtoConstructor, value);
    return await validate(instance);
  }

  abstract create(scheme: SchemeStore, block?: BlockStore, id?: string): TStore;
  abstract fromDto(scheme: SchemeStore, dto: TDto): TStore;
  abstract toDto(store: TStore): TDto;

  getContextMenu(icon: IconStore): IContextMenuItem[] {
    return this.leftSideTransformer?.getContextMenuForMain(icon) ?? [];
  }

  getContextMenuForChildIndex(icon: IIconWithList, index: number): IContextMenuItem[] {
    return [];
  }

  getIconForInsert(scheme: SchemeStore): IconStore | null {
    return null;
  }

  protected getLeftSide(scheme: SchemeStore, dto?: IconDto): LeftSideIconStore | undefined {
    if(!dto || !dto.leftSide || !this.leftSideTransformer) return;
    return this.leftSideTransformer.fromDto(scheme, dto.leftSide) as LeftSideIconStore;
  }
}
