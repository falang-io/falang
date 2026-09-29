import { resolveService } from '@falang/di';
import { checker } from '../checker.js';
import { TOKEN_I18N } from '../di-tokens.js';
import { CMD_SET_META } from '../scheme/scheme-commands.js';
import type { IContextMenuBuilderForIconParams } from '../modules/context-menu/context-menu.service.js';
import type { IconStore } from '../store/icon.store.js';

interface ISwitchTrueFalseTarget {
  metaKey: 'trueOnRight' | 'trueIsMain';
  currentValue: boolean;
}

const getSwitchTrueFalseTarget = (icon: IconStore): ISwitchTrueFalseTarget | null => {
  if (checker.isIf(icon)) return { metaKey: 'trueOnRight', currentValue: icon.trueOnRight };
  if (checker.isWhile(icon)) return { metaKey: 'trueIsMain', currentValue: icon.trueIsMain };
  return null;
};

/**
 * Context-menu item toggling `if`'s `trueOnRight`/`while`'s `trueIsMain` direction flag (see
 * `IfIconStore`/`WhileIconStore`) — merges the new key into whatever `meta` the node already carries
 * (e.g. `width` from a block resize) rather than replacing it, since `CMD_SET_META` overwrites `meta`
 * wholesale. A no-op for any other icon kind, so it's safe to register unconditionally alongside every
 * other icon-context-menu builder.
 *
 * Signature matches `IContextMenuBuilderForIconParams` so it can be passed straight to
 * `ContextMenuService.registerBuilderForIcon`.
 */
export const buildSwitchTrueFalseMenu = ({ icon, builder, scheme }: IContextMenuBuilderForIconParams): void => {
  const target = getSwitchTrueFalseTarget(icon);
  if (!target) return;
  const { metaKey, currentValue } = target;
  const t = resolveService(TOKEN_I18N, scheme.container).t;
  builder.addButtons({
    group: 'root',
    items: [
      {
        type: 'button',
        onClick: () => {
          const node = scheme.nodes.getNode(icon.id);
          scheme.commands.dispatchCommand(CMD_SET_META, {
            id: icon.id,
            meta: { ...node.meta, [metaKey]: !currentValue },
          });
        },
        text: t('menu:switch-true-false'),
      },
    ],
  });
};
