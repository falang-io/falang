import { getGlobalI18n } from '@falang/scheme';

/**
 * Side-effect module, imported once from `admin-app.tsx` — registers this package's own UI strings
 * (namespace `workflow-client-admin`) with the shared `I18NStore`, the same way
 * `packages/workflow/client-common/src/locales/register-client-locales.ts` does for the main app.
 */
getGlobalI18n().register('workflow-client-admin', {
  en: () => import('./en.json'),
  ru: () => import('./ru.json'),
});
