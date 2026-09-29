import { afterEach, describe, expect, it } from 'vitest';
import { resolveService } from '@falang/di';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { TOKEN_I18N } from '../../di-tokens.js';
import { CoreLocalesModule } from './core-locales.module.js';
import type { Scheme } from '../../scheme/scheme.js';

describe('CoreLocalesModule', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;

  afterEach(() => {
    scheme.dispose();
  });

  it('translates icon/base keys once the dynamically-imported bundle settles', async () => {
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new CoreLocalesModule()],
      document: getTestEmptyDoc(),
    });
    const i18n = resolveService(TOKEN_I18N, scheme.container);

    // `CoreLocalesModule.register(scheme)` fired `i18n.register(...)` fire-and-forget from inside
    // `scheme.registerModules()` — without this, `t()` would still be returning the raw key here.
    await i18n.whenIdle();

    expect(i18n.t('icon:break')).toBe('Break');
    expect(i18n.t('base:true')).toBe('True');
  });
});
