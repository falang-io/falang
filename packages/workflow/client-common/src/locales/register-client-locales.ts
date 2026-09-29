import { getGlobalI18n } from '@falang/scheme';

/**
 * Side-effect module, imported once from `app.tsx` — registers this package's own UI strings
 * (namespace `client`) with the shared `I18NStore`. Unlike a `Scheme`-scoped module's locales
 * (`CoreLocalesModule`, `IntegrationsModule`), these components (login/project-list/toolbar/
 * modals/tree) render outside any open document's `Scheme`, so there's no `IModule.register(scheme)`
 * hook to piggyback on — `getGlobalI18n()` is the same app-wide accessor `AuthStore` already uses.
 */
getGlobalI18n().register('workflow-client-common', {
  en: () => import('./en.json'),
  ru: () => import('./ru.json'),
});
