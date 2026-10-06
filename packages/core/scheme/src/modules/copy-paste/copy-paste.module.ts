import { createSchemeToken, resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { TOKEN_CONTEXT_MENU } from '../context-menu/context-menu.service.token.js';
import { CopyPasteService } from './copy-paste.service.js';
import type { ICopyPasteModuleParams } from './copy-paste.types.js';

export const TOKEN_COPY_PASTE = createSchemeToken<CopyPasteService>('COPY_PASTE');

export const MENU_COPY = 'menu:copy';
export const MENU_PASTE = 'menu:paste';

/**
 * Copy/paste of icons. "Copy" in an icon's context menu copies the icons-transfer selection when the icon is part
 * of it (else just that icon), together with this scheme's project and document type; "Paste" in a valence
 * point's context menu inserts the copied subtrees there with every node id replaced. Both menu entries need
 * `ContextMenuModule` on the same scheme; the selection needs `IconsTransferModule`; one undo step needs
 * `HistoryModule`. Without any of them the service still works programmatically (`TOKEN_COPY_PASTE`).
 */
export class CopyPasteModule implements IModule {
  private readonly params: ICopyPasteModuleParams;

  constructor(params: ICopyPasteModuleParams) {
    this.params = params;
  }

  register(scheme: Scheme) {
    scheme.container.registerInstance(TOKEN_COPY_PASTE, new CopyPasteService(scheme, this.params));
  }

  initialize(scheme: Scheme) {
    if (!scheme.container.isRegistered(TOKEN_CONTEXT_MENU, true)) return;
    const service = resolveService(TOKEN_COPY_PASTE, scheme.container);
    const contextMenu = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    // Raw `namespace:key` texts: the antd layer translates every menu text.
    contextMenu.registerBuilderForIcon(({ icon, builder }) => {
      const ids = service.getCopyIds(icon.id);
      if (ids.length === 0) return;
      builder.addButtons({
        group: 'root',
        items: [{ type: 'button', text: MENU_COPY, onClick: () => service.copy(ids) }],
      });
    });
    contextMenu.registerBuilderForValencePoint(({ vp, builder }) => {
      if (vp.type !== 'in-skewer' && vp.type !== 'in-switch') return;
      if (!service.canPasteAt(vp.parentId, vp.index)) return;
      builder.addButtons({
        group: 'root',
        items: [{ type: 'button', text: MENU_PASTE, onClick: () => service.paste(vp.parentId, vp.index) }],
      });
    });
  }
}
