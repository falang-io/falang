import { Lifecycle } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { ContextMenuService } from './context-menu.service.js';
import { TOKEN_CONTEXT_MENU } from './context-menu.service.token.js';
import { registerContextMenuHandlers } from './register-context-menu-handlers.js';

export class ContextMenuModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.register(TOKEN_CONTEXT_MENU, ContextMenuService, {
      lifecycle: Lifecycle.ContainerScoped,
    });
  }

  initialize(scheme: Scheme) {
    registerContextMenuHandlers(scheme);
  }
}
