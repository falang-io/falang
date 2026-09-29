import { getGlobalI18n } from '@falang/scheme';

/**
 * Side-effect module, imported once from `app.tsx` — registers this app's own chrome strings
 * (namespace `desktop-app-sketch`: the history panel's title, the "Versioning…" settings modal)
 * plus `@falang/antd`'s `version-history` namespace, which ships no
 * strings of its own and expects every host to register them (mirrors
 * `@falang/workflow-client-common`'s `register-client-locales.ts`, see
 * ADR 0025 (private)).
 */
getGlobalI18n().register('desktop-app-sketch', {
  en: () => import('./en.json'),
  ru: () => import('./ru.json'),
});
