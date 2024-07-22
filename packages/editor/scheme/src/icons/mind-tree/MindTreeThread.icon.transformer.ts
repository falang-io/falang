import { IContextMenuItem } from '@falang/frontend-core';
import { nanoid } from 'nanoid';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { SchemeStore } from '../../store/Scheme.store';
import { IconStore } from '../base/Icon.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { IIconWithList } from '../base/IIconList';
import { MindTreeChildIconTransformer } from './MindTreeChild.icon.transformer';
import { MindTreeThreadIconStore } from './MindTreeThread.icon.store';

export interface IMindTreeThreadIconTransformer extends IconTransformerParams<IconWithSkewerDto> {
  childTransformer: MindTreeChildIconTransformer
}

export class MindTreeThreadIconTransformer extends IconTransformer<IconWithSkewerDto, MindTreeThreadIconStore> {
  childTransformer: MindTreeChildIconTransformer
  constructor(params: IMindTreeThreadIconTransformer) {
    super(params);
    this.childTransformer = params.childTransformer;
  }
  create(scheme: SchemeStore): MindTreeThreadIconStore {
    const id = nanoid();
    return new MindTreeThreadIconStore({
      id,
      scheme,
      block: this.blockTransformer.create(scheme, id),
      transformer: this,
      children: [],
    })
  }
  fromDto(scheme: SchemeStore, dto: IconWithSkewerDto): MindTreeThreadIconStore {
    return new MindTreeThreadIconStore({
      id: dto.id,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      scheme,
      alias: dto.alias,
      transformer: this,
      children: dto.children.map((childDto) => this.childTransformer.fromDto(scheme, childDto as IconWithSkewerDto)),
    });
  }
  toDto(store: MindTreeThreadIconStore): IconWithSkewerDto {
    const blockDto = this.blockTransformer.toDto(store.block);
    return {
      id: store.id,
      alias: 'system',
      block: blockDto,
      children: store.list.icons.map(icon => icon.transformer.toDto(icon)),
    };
  }
  getContextMenuForChildIndex(icon: IIconWithList, index: number): IContextMenuItem[] {
    const t = icon.scheme.frontRoot.lang.t;
    return [{
      text: t('scheme:add_child'),
      onClick: () => {
        icon.list.splice(index, 0, [this.childTransformer.create(icon.scheme)])
      }
    }];
  }

  getIconForInsert(scheme: SchemeStore): IconStore | null {
    return this.childTransformer.create(scheme);
  }
}
