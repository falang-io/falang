import { resolveService } from '@falang/di';
import { TOKEN_I18N, type IModule, type Scheme } from '@falang/scheme';

const TYPESCRIPT_SCHEME_LOCALES_MODULE_ID = 'typescript-scheme';

/** `icon:create-var`/`icon:call-function`/`icon:arr-*`/etc. — the node kinds this package adds on top of `core/scheme`'s own `icon` namespace (see `CoreLocalesModule`). */
export class TypescriptSchemeLocalesModule implements IModule {
  register(scheme: Scheme) {
    const i18n = resolveService(TOKEN_I18N, scheme.container);
    i18n.register(TYPESCRIPT_SCHEME_LOCALES_MODULE_ID, {
      en: () => import('./en.json'),
      ru: () => import('./ru.json'),
    });
  }
}
