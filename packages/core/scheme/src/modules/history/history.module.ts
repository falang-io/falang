import { Lifecycle } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { HistoryStore } from './history.store.js';
import { TOKEN_HISTORY } from './history.store.token.js';
import { registerHistoryHandlers } from './register-history-handlers.js';

export class HistoryModule implements IModule {
  register(scheme: Scheme) {
    scheme.container.register(TOKEN_HISTORY, HistoryStore, {
      lifecycle: Lifecycle.ContainerScoped,
    });
  }

  initialize(scheme: Scheme) {
    registerHistoryHandlers(scheme);
  }
}
