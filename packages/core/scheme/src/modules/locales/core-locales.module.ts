import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { TOKEN_I18N } from '../../di-tokens.js';

const CORE_LOCALES_MODULE_ID = 'core-scheme';

export class CoreLocalesModule implements IModule {
  register(scheme: Scheme) {
    const i18n = resolveService(TOKEN_I18N, scheme.container);
    i18n.register(CORE_LOCALES_MODULE_ID, {
      en: () => import('./locales/en.json'),
      ru: () => import('./locales/ru.json'),
    });
  }
}
