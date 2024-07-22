import { IContextMenuItem } from '@falang/frontend-core';
import { nanoid } from 'nanoid';
import { IconStore } from '../..';
import { IconWithSkewerDto } from '../../common/skewer/IconWithSkewer.dto';
import { SchemeStore } from '../../store/Scheme.store';
import { IconTransformer, IconTransformerParams } from '../base/Icon.transformer';
import { IIconWithList } from '../base/IIconList';
import { MindTreeChildIconStore } from './MindTreeChild.icon.store';

export interface IMindTreeChildIconTransformerParams extends IconTransformerParams<IconWithSkewerDto>{
  allowChild: boolean;
}

export class MindTreeChildIconTransformer extends IconTransformer<IconWithSkewerDto, MindTreeChildIconStore> {
  private allowChild: boolean;
  constructor(params: IMindTreeChildIconTransformerParams) {
    super(params);
    this.allowChild = params.allowChild;
  }
  create(scheme: SchemeStore): MindTreeChildIconStore {
    const id = nanoid();
    return new MindTreeChildIconStore({
      id,
      scheme,
      block: this.blockTransformer.create(scheme, id),
      transformer: this,
      children: [],
      allowChild: this.allowChild,
    })
  }
  fromDto(scheme: SchemeStore, dto: IconWithSkewerDto): MindTreeChildIconStore {
    return new MindTreeChildIconStore({
      id: dto.id,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      scheme,
      transformer: this,
      children: dto.children?.map((childDto) => this.fromDto(scheme, childDto as IconWithSkewerDto)) ?? [],
      allowChild: this.allowChild,
    });
  }
  toDto(store: MindTreeChildIconStore): IconWithSkewerDto {
    const blockDto = this.blockTransformer.toDto(store.block);
    return {
      id: store.id,
      alias: 'system',
      block: blockDto,
      children: store.list.icons.map(icon => icon.transformer.toDto(icon)),
    };
  }
  getIconForInsert(scheme: SchemeStore): IconStore | null {
    return this.create(scheme);
  }
  getContextMenuForChildIndex(icon: IIconWithList, index: number): IContextMenuItem[] {
    const t = icon.scheme.frontRoot.lang.t;
    return [{
      text: t('scheme:add_child'),
      onClick: () => {
        icon.list.splice(index, 0, [this.create(icon.scheme)])
      }
    }];
  }
}
