import type { IModule, Scheme } from '@falang/scheme';
import { TOKEN_ANT_CONTEXT_MENU } from './ant-context-menu.token.js';
import { AntContextMenuService } from './ant-context-menu.service.js';
import { Lifecycle } from '@falang/di';
import { AntContextMenuLayer } from './ant-context-menu.layer.js';
import { registerContextMenuHandlers } from './register-context-menu-handlers.js';

export class AntContextMenuModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.register(TOKEN_ANT_CONTEXT_MENU, AntContextMenuService, {
      lifecycle: Lifecycle.Singleton,
    });
  }

  initialize(scheme: Scheme) {
    scheme.extraView.registerCoreSchemeLayer(AntContextMenuLayer);
    registerContextMenuHandlers(scheme);
  }
}
