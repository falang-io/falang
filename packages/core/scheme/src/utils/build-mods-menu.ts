import { resolveService } from '@falang/di';
import { TOKEN_I18N } from '../di-tokens.js';
import { CMD_INSERT_NODE } from '../scheme/scheme-commands.js';
import type { IContextMenuBuilderForIconParams } from '../modules/context-menu/context-menu.service.js';
import { createINodeByName } from './create-i-node-by-name.js';

/**
 * Icon context-menu builder offering, for every mod kind the icon's node config allows and the node does
 * not carry yet, an "add <kind>" button (ADR 0049). A no-op for nodes without a `mods` policy, so it is
 * safe to register unconditionally. Matches `IContextMenuBuilderForIconParams` for `registerBuilderForIcon`.
 */
export const buildModsMenu = ({ icon, builder, scheme }: IContextMenuBuilderForIconParams): void => {
  const kinds = (icon.nodeConfig.mods ?? []).filter((kind) => !icon.mods.some((mod) => mod.name === kind));
  if (kinds.length === 0) return;
  const t = resolveService(TOKEN_I18N, scheme.container).t;
  builder.addButtons({
    group: 'root',
    items: kinds.map((kind) => ({
      type: 'button' as const,
      text: t(`icon:${kind}`),
      onClick: () => {
        scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
          parentId: icon.id,
          index: icon.mods.length,
          slot: 'mods',
          node: createINodeByName(kind, scheme),
        });
      },
    })),
  });
};
