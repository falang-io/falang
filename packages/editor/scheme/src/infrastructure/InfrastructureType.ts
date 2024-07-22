import { IContextMenuItem } from '@falang/frontend-core';
import { action, makeObservable, runInAction } from 'mobx';
import { checker } from '../checker';
import { IconWithSkewerStore } from '../common/skewer/IconWithSkewer.store';
import { ThreadsIconStore } from '../common/threads/ThreadsIconStore';
import { IconStore } from '../icons/base/Icon.store';
import { IIconList, IIconWithList } from '../icons/base/IIconList';
import { IfIconStore } from '../icons/if/If.icon.store';
import { WhileStore } from '../icons/while/While.store';
import { SchemeStore } from '../store/Scheme.store';
import { IValencePointsRegisterItem } from '../store/ValencePointsRegisterer.store';
import { IInfrastructureConfig } from './IInfrastructureConfig';
import { InfrastructureStore } from './Infrastructure.store';

export type IInfrastructureTypes = Record<string, (scheme: SchemeStore) => Promise<InfrastructureType>>;


export type TIconNameInInfrastructure<TConfig extends IInfrastructureConfig> = TConfig['icons'][string];

export abstract class InfrastructureType<TConfig extends IInfrastructureConfig = IInfrastructureConfig> {
  constructor(readonly config: TConfig) {
    makeObservable(this);
  }

  getContextMenuForValencePoint(scheme: SchemeStore, vp: IValencePointsRegisterItem): IContextMenuItem[] {
    if (!vp.parentId) return [];
    const icon = scheme.icons.getSafe(vp.parentId);
    if (!icon) return [];
    const returnValue: IContextMenuItem[] = [];
    if (checker.isIconWithList(icon) && vp.index !== null) {
      returnValue.push(...icon.transformer.getContextMenuForChildIndex(icon, vp.index));
    }
    if (checker.isIconWithSkewer(icon)) {
      returnValue.push(...this.getContextMenuForSkewer(scheme, vp, icon));
    } else if (checker.isThreads(icon)) {
      returnValue.push(...this.getContextMenuForThreads(scheme, vp, icon));
    }
    return returnValue;
  }

  protected getContextMenuForSkewer(scheme: SchemeStore, vp: IValencePointsRegisterItem, icon: IconWithSkewerStore): IContextMenuItem[] {
    const index = vp.index;
    if (index === null) return [];
    const t = scheme.frontRoot.lang.t;
    const returnValue: IContextMenuItem[] = [];
    const actionsMenu = this.getActionsContextMenu(scheme, index, icon);
    const conditionsMenu = this.getConditionsContextMenu(scheme, index, icon);
    const outContextMenu = index === icon.list.size ? this.config.outs?.getContextMenuForOuts(scheme, icon) : [];
    if (actionsMenu.length > 2) {
      returnValue.push({
        text: t('icon:actions'),
        children: actionsMenu,
      });
    } else {
      returnValue.push(...actionsMenu);
    }
    if (conditionsMenu.length > 2) {
      returnValue.push({
        text: t('icon:conditions'),
        children: conditionsMenu,
      });
    } else {
      returnValue.push(...conditionsMenu);
    }
    //console.log({ outContextMenu });
    if (outContextMenu && outContextMenu.length) {
      returnValue.push({
        text: t('icon:outs'),
        children: outContextMenu,
      });
    } else {
      returnValue.push(...(outContextMenu ?? []));
    }
    return returnValue;
  }

  protected getActionsContextMenu(scheme: SchemeStore, index: number, icon: IconWithSkewerStore): IContextMenuItem[] {
    const iconNames = this.config.skewerIcons.filter((iconName) => {
      const iconConfig = this.config.icons[iconName];
      return !!iconConfig && iconConfig.context === 'action';
    });
    const returnValue = this.getContextMenuWithIcons(scheme, icon, iconNames, index);
    this.config.skewerIconsGroups?.forEach((group) => {
      const itemIconNames = group.icons.filter((iconName) => {
        const iconConfig = this.config.icons[iconName];
        return !!iconConfig && iconConfig.context === 'action';
      });
      const item: IContextMenuItem = {
        text: group.name,
        children: this.getContextMenuWithIcons(scheme, icon, itemIconNames, index),
      };
      if (item.children?.length) returnValue.push(item);
    });
    return returnValue;
  }

  protected getConditionsContextMenu(scheme: SchemeStore, index: number, icon: IconWithSkewerStore): IContextMenuItem[] {
    const iconNames = this.config.skewerIcons.filter((iconName) => {
      const iconConfig = this.config.icons[iconName];
      return !!iconConfig && (iconConfig.context === 'condition' || iconConfig.context === 'switch');
    });
    const returnValue = this.getContextMenuWithIcons(scheme, icon, iconNames, index);
    this.config.skewerIconsGroups?.forEach((group) => {
      const itemIconNames = group.icons.filter((iconName) => {
        const iconConfig = this.config.icons[iconName];
        return !!iconConfig && (iconConfig.context === 'condition' || iconConfig.context === 'switch');
      });
      const item: IContextMenuItem = {
        text: group.name,
        children: this.getContextMenuWithIcons(scheme, icon, itemIconNames, index),
      };
      if (item.children?.length) returnValue.push(item);
    });
    return returnValue;
  }

  protected getContextMenuWithIcons(scheme: SchemeStore, icon: IIconWithList, iconsNames: string[], index: number): IContextMenuItem[] {
    const returnValue: IContextMenuItem[] = [];
    const t = scheme.frontRoot.lang.t;
    for (const iconName of iconsNames) {
      const iconConfig = this.config.icons[iconName];
      if (!iconConfig) continue;
      returnValue.push({
        text: t(`icon:${iconName}`),
        onClick: () => this.insertIcon(icon, index, iconName)
      })
    }
    return returnValue;
  }

  @action insertIcon(icon: IIconWithList, index: number, aliasOrIcon: string | IconStore) {
    const scheme = icon.scheme;
    const list = icon.list;
    let iconForInsert: IconStore | null = aliasOrIcon instanceof IconStore ? aliasOrIcon : null;
    if (!iconForInsert) {
      iconForInsert = icon.transformer.getIconForInsert(icon.scheme);
    }
    if (!iconForInsert) {
      iconForInsert = (aliasOrIcon instanceof IconStore) ? aliasOrIcon : scheme.createEmptyIcon(aliasOrIcon, list.parentId);
    }
    scheme.dnd.animateInsertIcon(list, index, iconForInsert)
    const transformer = iconForInsert.transformer;
    const iconDto = transformer.toDto(iconForInsert);
    const iconId = iconForInsert.id;
    const listId = list.parentId;
    setTimeout(() => {
      scheme.onChange({
        back: () => {
          const list = scheme.icons.getSafe(listId) as IIconWithList | null;
          if (!list) {
            console.error('Back No list', listId);
            return;
          }
          const icon = scheme.icons.getSafe(iconId);
          if (!icon) {
            console.error('Back No icon', iconId);
            return;
          }
          list.list.removeIcon(icon);
          icon.dispose();
        },
        forward: () => {
          const icon = transformer.fromDto(scheme, iconDto);
          const list = scheme.icons.getSafe(listId) as IIconWithList | null;
          if (!list) {
            console.error('Forward No list', listId);
            return;
          }
          list.list.splice(index, 0, [icon]);
        }
      });
    }, 1000);
  }

  private getContextMenuForThreads(scheme: SchemeStore, vp: IValencePointsRegisterItem, icon: ThreadsIconStore): IContextMenuItem[] {
    const index = vp.index;
    if (index === null) return [];
    return this.getContextMenuWithIcons(scheme, icon, [], index);
  }

  getContextMenuForIcon(icon: IconStore): IContextMenuItem[] {
    const returnValue: IContextMenuItem[] = [];
    const parent = icon.parent;
    const t = icon.scheme.frontRoot.lang.t;

    if (checker.isOut(icon) && checker.isIconWithSkewer(icon.parent)) {
      returnValue.push({
        text: t('base:delete'),
        onClick: () => {
          if (!confirm(t('base:sure')) || !checker.isIconWithSkewer(icon.parent)) return;
          icon.scheme.infrastructure.config.outs?.remove(icon.parent)
        }
      });
      returnValue.push(...this.config.outs?.getContextMenuForOuts(icon.scheme, icon.parent) ?? []);
    } else if (checker.isIconWithList(parent)) {
      returnValue.push({
        text: t('base:delete'),
        onClick: () => {
          if (!confirm(t('base:sure'))) return;
          runInAction(() => {
            icon.scheme.selection.getSelectedIcons().forEach((iconToDelete) => {
              parent.list.deleteIcon(iconToDelete);
            });
          });
        }
      });
    }
    if (icon instanceof IfIconStore) {
      returnValue.push({
        text: 'Switch true / false',
        onClick: () => {
          runInAction(() => {
            icon.trueOnRight = !icon.trueOnRight;
            const first = icon.list.splice(0, 1);
            icon.list.splice(1, 0, first);
          });
        }
      });
    }
    if (icon instanceof WhileStore) {
      returnValue.push({
        text: 'Switch true / false',
        onClick: () => {
          runInAction(() => {
            icon.trueIsMain = !icon.trueIsMain;
          });
        }
      });
    }
    return returnValue;
  }

  createInfrastructureStore(scheme: SchemeStore): InfrastructureStore | null {
    return null;
  }

  afterFileSaved(rootIcon: IconStore, path: string) {

  }

  getOnCLickIconForInsert(scheme: SchemeStore): string | IconStore | null {
    const nearest = scheme.valencePoints.selectedValencePoint;
    if (!nearest || !nearest.parentId) return null;
    const icon = scheme.icons.get(nearest.parentId);
    const fromTransformer = icon.transformer.getIconForInsert(scheme);
    if(fromTransformer) return fromTransformer;
    if (nearest.type === 'in-skewer') {
      return scheme.valencePoints.lastInsertedAlias;
    } else if (nearest.type === 'in-switch') {      
      if (checker.isThreads(icon) && icon.threads.editable) {
        if (icon.alias !== 'system') {
          const iconConfig = scheme.infrastructure.config.icons[icon.alias];
          if (iconConfig && checker.isSwitchTransformer(iconConfig.transformer)) {
            return iconConfig.transformer.switchOptionTransformer.create(scheme);
          }
          if (iconConfig && checker.isParallelTransformer(iconConfig.transformer)) {
            return iconConfig.transformer.threadTransformer.create(scheme);
          }
          if (iconConfig && checker.isLifegramTransformer(iconConfig.transformer)) {
            return iconConfig.transformer.functionIconTransformer.create(scheme);
          }
        } else {
          return this.getOnClickSystemIconForInsert(scheme);
        }

      }
    }
    return null;
  }

  protected getOnClickSystemIconForInsert(scheme: SchemeStore): string | IconStore | null {
    const nearest = scheme.valencePoints.selectedValencePoint;
    if (!nearest || !nearest.parentId) return null;
    const icon = scheme.icons.get(nearest.parentId);
    if (!checker.isThreads(icon)) return null;
    const parentParent = icon.parent?.parent;
    if (parentParent) {
      const iconConfig = scheme.infrastructure.config.icons[parentParent.alias];
      if (iconConfig && checker.isLifegramTransformer(iconConfig.transformer)) {
        return iconConfig.transformer.functionIconTransformer.returnTransformer.create(scheme);
      }
    }
    return null;
  }

}
