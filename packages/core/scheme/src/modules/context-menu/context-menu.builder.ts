import type { INode } from '@falang/dto';
import { CMD_INSERT_NODE } from '../../scheme/scheme-commands.js';
import type { Scheme } from '../../scheme/scheme.js';
import type { IContextMenuButton, IContextMenuItem } from '../../types/context-menu.js';
import { createINodeByName } from '../../utils/create-i-node-by-name.js';

export interface IAddButtonsForGroupParams {
  group: string;
  /**
   * Explicit nested group path (outermost first), used instead of `group` when set. Unlike `group`, whose
   * `:`-separated string is split into a path, each segment is taken verbatim — needed for segments that
   * are themselves `namespace:key` i18n keys (e.g. a vendor label).
   */
  groupPath?: readonly string[];
  items: IContextMenuButton[];
}

export interface IAddButtonForIconsItemParams {
  name: string;
  updateNode?: (node: INode) => INode;
}

export interface IAddButtonsForIconsParams {
  group: string;
  groupPath?: readonly string[];
  items: (string | IAddButtonForIconsItemParams)[];
  parentId: string;
  index: number;
}

export class ContextMenuBuilder {
  readonly scheme: Scheme;
  constructor(scheme: Scheme) {
    this.scheme = scheme;
  }

  private menu: IContextMenuItem[] = [];

  addButtons(params: IAddButtonsForGroupParams) {
    const groupItems = params.groupPath ? this.getGroupItemsByPath(params.groupPath) : this.getGroupItems(params.group);
    groupItems.push(...params.items);
  }

  addForIcons(params: IAddButtonsForIconsParams) {
    this.addButtons({
      group: params.group,
      groupPath: params.groupPath,
      items: params.items.map((item) => ({
        type: 'button',
        text: `icon:${item}`,
        onClick: () => {
          let node: INode | null = null;
          if (typeof item === 'string') {
            node = createINodeByName(item, this.scheme);
          } else {
            node = createINodeByName(item.name, this.scheme);
            if (item.updateNode) {
              node = item.updateNode(node);
            }
          }
          this.scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
            index: params.index,
            parentId: params.parentId,
            node,
          });
        },
      })),
    });
  }

  private getGroupItemsByPath(path: readonly string[]): IContextMenuItem[] {
    let currentMenu = this.menu;
    for (const name of path) {
      let foundItem = currentMenu.filter((item) => item.type === 'group').find((item) => item.text === name);
      if (!foundItem) {
        foundItem = { text: name, type: 'group', children: [] };
        currentMenu.push(foundItem);
      }
      currentMenu = foundItem.children;
    }
    return currentMenu;
  }

  private getGroupItems(groupName: string, prevMenu?: IContextMenuItem[]): IContextMenuItem[] {
    if (groupName === 'root') {
      return this.menu;
    }
    const names = groupName.split(':');
    const [firstName, ...restNames] = names;
    const currentMenu = prevMenu ?? this.menu;
    let foundItem = currentMenu.filter((item) => item.type === 'group').find((item) => item.text === firstName);
    if (!foundItem) {
      foundItem = {
        text: firstName,
        type: 'group',
        children: [],
      };
      currentMenu.push(foundItem);
    }
    if (restNames.length === 0) {
      return foundItem.children;
    }
    return this.getGroupItems(restNames.join(':'), foundItem.children);
  }

  getMenu() {
    return this.menu;
  }
}
