import { IContextMenuItem } from '@falang/frontend-core';
import { nanoid } from 'nanoid';
import { BlockTransformer } from '../../common/blocks/Block.transformer';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { SchemeStore } from '../../store/Scheme.store';
import { EmptyIconTransformer } from '../base/EmptyIcon.transformer';
import { IconStore } from '../base/Icon.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { IIconWithList } from '../base/IIconList';
import { MindTreeRootIconDto } from './MindThreeRoot.icon.dto';
import { MindTreeRootIconStore } from './MindTreeRoot.icon.store';
import { MindTreeThreadIconStore } from './MindTreeThread.icon.store';
import { MindTreeThreadIconTransformer } from './MindTreeThread.icon.transformer';

export interface IMindTreeRootIconTransformer extends IconTransformerParams<MindTreeRootIconDto> {
  threadTransformer: MindTreeThreadIconTransformer
  headerBlockTransformer: BlockTransformer
}

export class MindTreeRootIconTransformer extends IconTransformer<MindTreeRootIconDto, MindTreeRootIconStore> {
  threadTransformer: MindTreeThreadIconTransformer
  headerBlockTransformer: BlockTransformer
  constructor(params: IMindTreeRootIconTransformer) {
    super(params);
    this.threadTransformer = params.threadTransformer;
    this.headerBlockTransformer = params.headerBlockTransformer;
  }
  create(scheme: SchemeStore): MindTreeRootIconStore {
    const id = nanoid();
    const headerId = nanoid();
    return new MindTreeRootIconStore({
      id,
      scheme,
      block: this.blockTransformer.create(scheme, id),
      transformer: this,
      children: [
        this.threadTransformer.create(scheme),
        this.threadTransformer.create(scheme),
      ],
      header: new IconStore({
        id: headerId,
        alias: 'system',
        block: this.headerBlockTransformer.create(scheme, headerId),
        scheme,
        transformer: new EmptyIconTransformer()
      }),
      editable: true,
      gaps: [],
      alias: this.alias,
    })
  }
  fromDto(scheme: SchemeStore, dto: MindTreeRootIconDto): MindTreeRootIconStore {
    return new MindTreeRootIconStore({
      id: dto.id,
      alias: dto.alias,
      editable: true,
      gaps: dto.gaps,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      scheme,
      transformer: this,
      children: dto.children.map((childDto) => this.threadTransformer.fromDto(scheme, childDto as IconWithSkewerDto)),
      header: new IconStore({
        id: dto.header.id,
        alias: 'system',
        block: this.headerBlockTransformer.fromDto(scheme, dto.header.block, dto.header.id),
        scheme,
        transformer: new EmptyIconTransformer()
      }),
    });
  }
  toDto(store: MindTreeRootIconStore): MindTreeRootIconDto {
    const blockDto = this.blockTransformer.toDto(store.block);
    return {
      id: store.id,
      alias: store.alias,
      block: blockDto,
      children: store.list.icons.map(icon => this.threadTransformer.toDto(icon)),
      gaps: store.threads.gaps,
      header: {
        alias: 'system',
        block: this.headerBlockTransformer.toDto(store.header.block),
        id: store.header.id,
      },
    };
  }
  getContextMenuForChildIndex(icon: IIconWithList, index: number): IContextMenuItem[] {
    const t = icon.scheme.frontRoot.lang.t;
    return [{
      text: t('scheme:add_child'),
      onClick: () => {
        icon.list.splice(index, 0, [this.threadTransformer.create(icon.scheme)])
      }
    }];
  }

  getIconForInsert(scheme: SchemeStore): IconStore | null {
    return this.threadTransformer.create(scheme);
  }
}
