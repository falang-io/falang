import { resolveService } from '@falang/di';
import { TOKEN_I18N, type Scheme } from '@falang/scheme';

const WORKFLOW_SCHEME_LOCALES_MODULE_ID = 'workflow-scheme';

/** Editor-chrome strings (placeholders, buttons) shared by the integration action/choice/question editors — not vendor-specific, see `IWorkflowIntegration.locales` for those. */
export const registerWorkflowSchemeLocales = (scheme: Scheme): void => {
  const i18n = resolveService(TOKEN_I18N, scheme.container);
  i18n.register(WORKFLOW_SCHEME_LOCALES_MODULE_ID, {
    en: () => import('./en.json'),
    ru: () => import('./ru.json'),
  });
};
