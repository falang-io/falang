import { IContextMenuItem } from '@falang/frontend-core';
import { runInAction } from 'mobx';
import { nanoid } from 'nanoid';
import { IconWithSkewerStore } from '../skewer/IconWithSkewer.store';
import { IconTransformer, IconTransformerParams } from '../../icons/base/Icon.transformer';
import { SchemeStore } from '../../store/Scheme.store';
import { OutDto } from './Out.dto';
import { OutStore, TOutType } from './Out.store';
import { BlockTransformer } from '../blocks/Block.transformer';
import { OutMinimalBlockTransformer } from './block/OutMinimal.block.transformer';

//blockShapeTypes?: TOutType[] | false
export interface IOutTransformerParams extends Omit<IconTransformerParams<OutDto>, 'blockTransformer'> {
  //isBlockShape?: (out: OutStore) => boolean
  throwBlockTransformer?: BlockTransformer<any, any, any>
  returnBlockTransformer?: BlockTransformer<any, any, any>
}

export class OutTransformer extends IconTransformer<OutDto, OutStore> {
  throwBlockTransformer: BlockTransformer | null;
  returnBlockTransformer: BlockTransformer | null;

  constructor(params: IOutTransformerParams) {
    super({
      ...params,
      blockTransformer: new OutMinimalBlockTransformer()
    });
    this.throwBlockTransformer = params.throwBlockTransformer ?? null;
    this.returnBlockTransformer = params.returnBlockTransformer ?? null;
  }

  set(icon: IconWithSkewerStore, type: TOutType, outLevel?: number) {
    const id = nanoid();
    const blockTransformer = this.getBlockTransformer(type);
    const outDto: OutDto = {
      alias: 'type',
      block: {
        width: 0
      },
      id,
      level: outLevel ?? 1,
      type,
    }
    const store = new OutStore({
      type,
      alias: type,
      block: blockTransformer.create(icon.scheme, id, outDto),
      outLevel,
      id,
      scheme: icon.scheme,
      transformer: this,
    });
    icon.list.setOutStore(store);
    return store;
  }

  remove(icon: IconWithSkewerStore) {
    if(!icon.list.outStore) return;
    icon.list.removeOutStore();
  }

  private getBlockTransformer(type: TOutType) {
    let blockTransformer = this.blockTransformer;
    if(type === 'throw' && this.throwBlockTransformer) {
      blockTransformer = this.throwBlockTransformer;
    } else if (type === 'return' && this.returnBlockTransformer) {
      blockTransformer = this.returnBlockTransformer;
    }
    return blockTransformer;
  }

  create(scheme: SchemeStore): OutStore {
    const id = nanoid();
    const blockTransformer = this.getBlockTransformer('break');
    return new OutStore({
      type: 'break',
      alias: this.alias,
      block: blockTransformer.create(scheme, id),
      id,
      scheme,
      transformer: this,
    });
  }

  fromDto(scheme: SchemeStore, dto: OutDto): OutStore {
    const blockTransformer = this.getBlockTransformer(dto.type);
    return new OutStore({
      type: dto.type,
      outLevel: dto.level,
      alias: dto.type,
      block: blockTransformer.fromDto(scheme, dto.block, dto.id, dto),
      id: dto.id,
      scheme,
      transformer: this,
    });
  }

  toDto(store: OutStore): OutDto {
    const blockTransformer = this.getBlockTransformer(store.type);
    return {
      type: store.type,
      level: store.outLevel,
      alias: this.alias,
      block: blockTransformer.toDto(store.block),
      id: store.id,
    }
  }

  getContextMenuForOuts(scheme: SchemeStore, icon: IconWithSkewerStore): IContextMenuItem[] {
    if(icon.skewer.isFirst) return [];
    const returnValue: IContextMenuItem[] = [];
    const cycleDepth = icon.getCycleDepth();
    const t = icon.scheme.frontRoot.lang.t;
    for (let i = 1; i <= cycleDepth; i++) {
      const outLevel = i;
      returnValue.push({
        text: `${t('icon:break')} ${i}`,
        onClick: () => {
          scheme.infrastructure.config.outs?.set(icon, 'break', outLevel);
        }
      });
    }
    for (let i = 1; i <= cycleDepth; i++) {
      const outLevel = i;
      returnValue.push({
        text: `${t('icon:continue')} ${i}`,
        onClick: () => {
          scheme.infrastructure.config.outs?.set(icon, 'continue', outLevel);
        }
      });
    }
    const returnDepth = icon.getReturnDepth();
    if(returnDepth > 0 && icon.canHaveReturn()) {
      for (let i = 1; i <= returnDepth; i++) {
        const outLevel = i;
        returnValue.push({
          text: `${t('icon:return')} ${i}`,
          onClick: () => {
            scheme.infrastructure.config.outs?.set(icon, 'return', outLevel);
          }
        });
      }
    }

    returnValue.push({
      text: `${t('icon:throw')}`,
      onClick: () => {
        scheme.infrastructure.config.outs?.set(icon, 'throw', 1);
      }
    });

    return returnValue;
  }
}
