import { IContextMenuItem } from '@falang/frontend-core';
import { nanoid } from 'nanoid';
import { SchemeStore } from '../../store/Scheme.store';
import { IconDto } from '../base/Icon.dto';
import { IconStore } from '../base/Icon.store';
import { IconTransformer } from '../base/Icon.transformer';
import { ISideIconTransformer } from './ISideIconTransformer';
import { TimerSideIconStore } from './TimerSide.icon.store';

export class TimerSideIconTransformer extends IconTransformer<IconDto, TimerSideIconStore> implements ISideIconTransformer {
  create(scheme: SchemeStore): TimerSideIconStore {
    const id = nanoid();
    return new TimerSideIconStore({
      alias: this.alias,
      block: this.blockTransformer.create(scheme, id),
      id,
      scheme,
      transformer: this,
    });
  }

  fromDto(scheme: SchemeStore, dto: IconDto): TimerSideIconStore {
    return new TimerSideIconStore({
      alias: this.alias,
      block: this.blockTransformer.fromDto(scheme, dto.block, dto.id),
      id: dto.id,
      scheme,
      transformer: this,
    });
  }

  toDto(store: TimerSideIconStore): IconDto {
    return {
      id: store.id,
      alias: this.alias,
      block: this.blockTransformer.toDto(store.block),
    }
  }

  getContextMenu(icon: IconStore): IContextMenuItem[] {
    const t = icon.scheme.frontRoot.lang.t;
    const parentId = icon.parentId?.concat('');
    const returnValue = super.getContextMenu(icon);
    const transformer = icon.transformer;
    const scheme = icon.scheme;
    if(parentId) {
      returnValue.push({
        text: t('base:delete'),
        onClick: () => {
          const dto = this.toDto(icon as TimerSideIconStore);
          icon.parent?.setSideStore(null);
          icon.scheme.onChange({
            back: () => {
              const parent = scheme.icons.get(parentId);
              if(!parent) {
                console.error(`Cant find parent by id: ${parentId}`);
                return;
              }
              parent.setSideStore(this.fromDto(scheme, dto));
            },
            forward: () => {
              const parent = scheme.icons.get(parentId);
              if(!parent) {
                console.error(`Cant find parent by id: ${parentId}`);
                return;
              }
              parent.setSideStore(null);
            },
          })
        },
      });
    }
    return returnValue;
  }

  getContextMenuForMain(icon: IconStore): IContextMenuItem[] {
    if (icon.leftSideStore) return [];
    const t = icon.scheme.frontRoot.lang.t;
    const parentId = icon.id;
    return [{
      text: t('icon:timer_side'),
      onClick: () => {

        const newIcon = this.create(icon.scheme);
        icon.setSideStore(newIcon);
        const newIconDto = this.toDto(newIcon);
        const scheme = icon.scheme;
        

        icon.scheme.onChange({
          back: () => {
            const parent = scheme.icons.get(parentId);
            if(!parent) {
              console.error(`Cant find parent by id: ${parentId}`);
              return;
            }
            parent.setSideStore(null);
          },
          forward: () => {
            const parent = scheme.icons.get(parentId);
            if(!parent) {
              console.error(`Cant find parent by id: ${parentId}`);
              return;
            }
            parent.setSideStore(this.fromDto(scheme, newIconDto));
          },
        })
      }
    }];
  }
}

