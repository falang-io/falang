import { Lifecycle, resolveService } from '@falang/di';
import {
  CMD_VALENCE_POINT_CLICKED,
  TOKEN_CONTEXT_MENU,
  TOKEN_I18N,
  type IContextMenuItem,
  type IModule,
  type Scheme,
} from '@falang/scheme';
import { translateContextMenuItems } from '../ant-context-menu/register-context-menu-handlers.js';
import { AntItemPickerModalLayer } from './ant-item-picker-modal.layer.js';
import { AntItemPickerModalService } from './ant-item-picker-modal.service.js';
import { TOKEN_ANT_ITEM_PICKER_MODAL } from './ant-item-picker-modal.token.js';
import type { IItemPickerModalItem } from './item-picker-modal.cmp.js';

export const flattenInsertableMenuItems = (items: readonly IContextMenuItem[]): IItemPickerModalItem[] => {
  const result: IItemPickerModalItem[] = [];
  const visit = (entries: readonly IContextMenuItem[], path: readonly string[]) => {
    entries.forEach((item, index) => {
      if (item.type === 'group') {
        visit(item.children, [...path, item.text]);
        return;
      }
      if (!item.nodeName) return;
      result.push({
        key: [...path, item.nodeName, String(index)].join(':'),
        label: item.text,
        path,
        searchAliases: [item.nodeName],
        onSelect: item.onClick,
      });
    });
  };
  visit(items, []);
  return result;
};

export class AntItemPickerModalModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.register(TOKEN_ANT_ITEM_PICKER_MODAL, AntItemPickerModalService, {
      lifecycle: Lifecycle.Singleton,
    });
  }

  initialize(scheme: Scheme) {
    scheme.extraView.registerCoreSchemeLayer(AntItemPickerModalLayer);
    scheme.commands.registerCommand(
      CMD_VALENCE_POINT_CLICKED,
      ({ vp }) => {
        if (!scheme.isEditing) return true;
        const parent = scheme.icons.getIconSafe(vp.parentId);
        if (!parent || scheme.infra.structure.configsMap.get(parent.name)?.children !== true) return false;
        const contextMenu = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
        const menu = contextMenu.buildForValencePoint({ scheme, vp, parent });
        const t = resolveService(TOKEN_I18N, scheme.container).t;
        const items = flattenInsertableMenuItems(translateContextMenuItems(menu, t));
        if (items.length === 0) return false;
        resolveService(TOKEN_ANT_ITEM_PICKER_MODAL, scheme.container).show(items);
        return true;
      },
      4,
    );
  }
}
