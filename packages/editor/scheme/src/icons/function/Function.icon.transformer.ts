import { nanoid } from 'nanoid';
import { BlockTransformer } from '../../common/blocks/Block.transformer';
import { SYSTEM_ALIAS } from '../../common/constants';
import { SchemeStore } from '../../store/Scheme.store';
import { EmptyIconTransformer } from '../base/EmptyIcon.transformer';
import { IconStore } from '../base/Icon.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { FunctionIconDto } from './Function.icon.dto';
import { FunctionIconStore } from './Function.icon.store';

export interface IFunctionIconTransformerParams extends IconTransformerParams<FunctionIconDto> {
  headerBlockTransformer: BlockTransformer<any>,
  footerBlockTransformer: BlockTransformer<any>,
  fillBlockWidth?: boolean
}

export class FunctionIconTransformer extends IconTransformer<FunctionIconDto, FunctionIconStore> {
  readonly headerBlockTransformer: BlockTransformer<any>;
  readonly footerBlockTransformer: BlockTransformer<any>;
  fillBlockWidth: boolean

  constructor({headerBlockTransformer, footerBlockTransformer, ...params}: IFunctionIconTransformerParams) {
    super(params);
    this.headerBlockTransformer = headerBlockTransformer;
    this.footerBlockTransformer = footerBlockTransformer;
    this.fillBlockWidth = !!params.fillBlockWidth;
  }

  create(scheme: SchemeStore): FunctionIconStore {
    const id = nanoid();
    const headerId = nanoid();
    const footerId = nanoid();
    const store = new FunctionIconStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      id,
      scheme,
      children: [],
      footer: new IconStore({
        alias: SYSTEM_ALIAS,
        block: this.footerBlockTransformer.create(scheme, footerId),
        id: footerId,
        scheme,
        transformer: EmptyIconTransformer.getTransformer(),
      }),
      header: new IconStore({
        alias: SYSTEM_ALIAS,
        block: this.headerBlockTransformer.create(scheme, headerId),
        id: headerId,
        scheme,
        transformer: EmptyIconTransformer.getTransformer(),
      }),
      transformer: this,
      fillBlockWidth: this.fillBlockWidth,
    });
    store.header.setParentId(id);
    store.footer.setParentId(id);
    return store;
  }

  fromDto(scheme: SchemeStore, dto: FunctionIconDto): FunctionIconStore {
    const headerId = nanoid();
    const footerId = nanoid();
    const store = new FunctionIconStore({
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      id: dto.id,
      scheme,
      children: dto.children.map((childDto) => scheme.createIconFromDto(childDto, dto.id)),
      footer: new IconStore({
        alias: SYSTEM_ALIAS,
        block: this.footerBlockTransformer.fromDto(scheme, dto.footer, footerId),
        id: footerId,
        scheme,
        transformer: EmptyIconTransformer.getTransformer(),
      }),
      header: new IconStore({
        alias: SYSTEM_ALIAS,
        block: this.headerBlockTransformer.fromDto(scheme, dto.header, headerId),
        id: headerId,
        scheme,
        transformer: EmptyIconTransformer.getTransformer(),
      }),
      transformer: this,
      fillBlockWidth: this.fillBlockWidth,
    });
    store.header.setParentId(dto.id);
    store.footer.setParentId(dto.id);
    store.list.icons.forEach((icon) => icon.setParentId(dto.id));
    return store;
  }

  toDto(store: FunctionIconStore): FunctionIconDto {
    return {
      id: store.id,
      alias: this.alias,
      header: this.headerBlockTransformer.toDto(store.header.block),
      block: this.blockTransformer.toDto(store.block),
      children: store.list.icons.map((child) => store.scheme.iconToDto(child)),
      footer: this.footerBlockTransformer.toDto(store.footer.block),      
    };
  }

}