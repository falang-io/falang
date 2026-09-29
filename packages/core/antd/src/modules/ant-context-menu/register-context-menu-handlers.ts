import { resolveService } from '@falang/di';
import type { IContextMenuItem, Scheme, TFunction } from '@falang/scheme';
import { CMD_SHOW_CONTEXT_MENU, TOKEN_I18N } from '@falang/scheme';
import { TOKEN_ANT_CONTEXT_MENU } from './ant-context-menu.token.js';

/**
 * Single spot every context-menu item's `text` is resolved through `t()` — builders (e.g.
 * `addForIcons` in `context-menu.builder.ts`) construct raw `namespace:key` strings without
 * calling `t()` themselves, since they have no reactive render to subscribe `t`'s observable
 * reassignment to; `AntContextMenuService`/`ant-context-menu.service.ts` just passes `item.text`
 * straight into antd's `label` with no translation step of its own. Safe to run on text that's
 * already been resolved by a builder (e.g. `buildOutsMenu`'s `` t('icon:break') `` calls) — a
 * plain string with no `:` namespace separator just passes through `t()` unchanged, see ADR 0008.
 */
export const translateContextMenuItems = (items: readonly IContextMenuItem[], t: TFunction): IContextMenuItem[] =>
  items.map((item) =>
    item.type === 'group'
      ? { ...item, text: t(item.text), children: translateContextMenuItems(item.children, t) }
      : { ...item, text: t(item.text) },
  );

export const registerContextMenuHandlers = (baseScheme: Scheme) => {
  baseScheme.commands.registerCommand(CMD_SHOW_CONTEXT_MENU, ({ e, menu }, scheme) => {
    const service = resolveService(TOKEN_ANT_CONTEXT_MENU, scheme.container);
    const t = resolveService(TOKEN_I18N, scheme.container).t;
    service.show(translateContextMenuItems(menu, t), e.clientX, e.clientY);
    return true;
  });
};
