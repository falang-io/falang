import { Lifecycle, resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { HistoryStore } from './history.store.js';
import { TOKEN_HISTORY } from './history.store.token.js';
import { registerHistoryHandlers } from './register-history-handlers.js';

export interface IHistoryModuleOptions {
  /**
   * An existing store to continue (e.g. the one of a scheme being rebuilt from the same document): the new scheme
   * must have the same node ids. The module never disposes or clears it.
   */
  store?: HistoryStore;
}

export class HistoryModule implements IModule {
  private readonly options: IHistoryModuleOptions;

  constructor(options: IHistoryModuleOptions = {}) {
    this.options = options;
  }

  register(scheme: Scheme) {
    if (this.options.store) {
      scheme.container.registerInstance(TOKEN_HISTORY, this.options.store);
      return;
    }
    scheme.container.register(TOKEN_HISTORY, HistoryStore, {
      lifecycle: Lifecycle.ContainerScoped,
    });
  }

  initialize(scheme: Scheme) {
    resolveService(TOKEN_HISTORY, scheme.container).attach(scheme);
    registerHistoryHandlers(scheme);
  }

  dispose(scheme: Scheme) {
    resolveService(TOKEN_HISTORY, scheme.container).detach(scheme);
  }
}
