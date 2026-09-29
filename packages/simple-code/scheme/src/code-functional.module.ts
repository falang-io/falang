import type { ContextMenuBuilder, IconStore, IModule, Scheme } from '@falang/scheme';
import {
  buildSwitchTrueFalseMenu,
  checker,
  CMD_DELETE_NODE,
  CMD_INSERT_NODE,
  CMD_SET_OUT,
  CMD_VALENCE_POINT_CLICKED,
  createINodeByName,
  isIconDeletable,
  TOKEN_CONTEXT_MENU,
  TOKEN_I18N,
} from '@falang/scheme';
import { resolveService } from '@falang/di';

/**
 * Offers `break`/`continue`/`return`/`throw` at the end of a skewer chain inside a cycle or
 * function. Simplified vs. `@falang/typescript-scheme`'s `buildOutsMenu`: this domain's codegen
 * (`@falang/simple-code-export`) doesn't understand multi-level `outLevel` (no `_break_level`-style counter
 * machinery, unlike `@falang/logic-constructor`), so exactly one button per out-kind instead of one
 * per nesting depth. `returnsCount` is likewise always 1 here — the `code` domain has no `contour`
 * root to multiply it against.
 */
const buildOutsMenu = (scheme: Scheme, parent: IconStore, builder: ContextMenuBuilder) => {
  const parentParent = parent.parent;
  if (!checker.isWithThreads(parentParent)) return;
  const indexInParentParent = parentParent.list.iconsIds.indexOf(parent.id);
  if (indexInParentParent < 1) return;
  const t = resolveService(TOKEN_I18N, scheme.container).t;
  const addOut = (name: 'break' | 'continue' | 'return' | 'throw') => {
    builder.addButtons({
      group: 'outs',
      items: [
        {
          onClick: () => {
            const node = createINodeByName(name, scheme);
            scheme.commands.dispatchCommand(CMD_SET_OUT, { id: parent.id, outNode: node });
          },
          text: t(`icon:${name}`),
          type: 'button',
        },
      ],
    });
  };
  addOut('break');
  addOut('continue');
  addOut('throw');
  addOut('return');
};

export class CodeFunctionalModule implements IModule {
  register(scheme: Scheme) {
    scheme.commands.registerCommand(CMD_VALENCE_POINT_CLICKED, ({ vp }) => {
      const parentIcon = scheme.icons.getIcon(vp.parentId);
      const nodeConfig = scheme.infra.structure.configsMap.get(parentIcon.name);
      if (!nodeConfig) return false;
      const childName = Array.isArray(nodeConfig.children) ? nodeConfig.children[0] : 'action';
      const newNode = scheme.infra.structure.factory(childName);
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: vp.index,
        parentId: vp.parentId,
        node: newNode,
      });
      return true;
    });
  }

  initialize(scheme: Scheme) {
    const contextMenuService = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    contextMenuService.registerBuilderForValencePoint(({ builder, vp, parent }) => {
      if (!checker.isWithSkewer(parent)) return;
      const t = resolveService(TOKEN_I18N, scheme.container).t;
      const addGroup = (groupKey: string, items: string[]) => {
        builder.addForIcons({
          group: t(groupKey),
          index: vp.index,
          parentId: vp.parentId,
          items,
        });
      };
      addGroup('menu:group-action', ['action']);
      addGroup('menu:group-condition', ['if', 'switch']);
      addGroup('menu:group-cycles', ['foreach', 'while', 'pseudo-cycle']);
      const isLastIndex = vp.index === parent.list.iconsIds.length;
      if (isLastIndex) {
        buildOutsMenu(scheme, parent, builder);
      }
    });
    contextMenuService.registerBuilderForIcon(({ icon, builder }) => {
      if (!isIconDeletable(scheme, icon.id)) return;
      const t = resolveService(TOKEN_I18N, scheme.container).t;
      builder.addButtons({
        group: 'root',
        items: [
          {
            type: 'button',
            onClick: () => {
              scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: icon.id });
            },
            text: t('menu:delete'),
          },
        ],
      });
    });
    contextMenuService.registerBuilderForIcon(buildSwitchTrueFalseMenu);
  }
}
