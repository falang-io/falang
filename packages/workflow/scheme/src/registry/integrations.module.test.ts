import { container as diContainer, resolveService } from '@falang/di';
import { registerGlobalTokens, TOKEN_I18N, type Scheme } from '@falang/scheme';
import type { IWorkflowIntegration, TIntegrationLocaleLoader } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { TOKEN_DOCUMENTS_PROVIDER } from './di-tokens.js';
import { IntegrationsModule } from './integrations.module.js';

const loaderFor =
  (resources: Record<string, Record<string, unknown>>): TIntegrationLocaleLoader =>
  () =>
    Promise.resolve({ default: resources });

describe('IntegrationsModule locales', () => {
  it("registers a vendor's locales, keyed by `integration:<vendor>`, alongside the shared editor-chrome bundle", async () => {
    registerGlobalTokens();
    const container = diContainer.createChildContainer();
    const fakeScheme = { container } as unknown as Scheme;
    const acmeIntegration: IWorkflowIntegration = {
      vendor: 'acme',
      label: 'acme:label',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [],
      locales: {
        en: loaderFor({ acme: { label: 'Acme' } }),
      },
    };

    new IntegrationsModule([acmeIntegration]).register(fakeScheme);

    const i18n = resolveService(TOKEN_I18N, container);
    await i18n.whenIdle();

    expect(i18n.t('acme:label')).toBe('Acme');
    // The `workflow-scheme` editor-chrome bundle (`../locales/en.json`) is registered by
    // `IntegrationsModule` itself, independent of any vendor's own `locales`.
    expect(i18n.t('integration-editor:select-placeholder')).toBe('Select…');
  });

  it("leaves a vendor's `label` untranslated (raw string passthrough) when it has no `locales`", async () => {
    registerGlobalTokens();
    const container = diContainer.createChildContainer();
    const fakeScheme = { container } as unknown as Scheme;
    const bareIntegration: IWorkflowIntegration = {
      vendor: 'bare',
      label: 'Bare Vendor',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [],
    };

    new IntegrationsModule([bareIntegration]).register(fakeScheme);

    const i18n = resolveService(TOKEN_I18N, container);
    await i18n.whenIdle();

    expect(i18n.t(bareIntegration.label)).toBe('Bare Vendor');
  });
});

describe('IntegrationsModule documents provider', () => {
  const buildScheme = (container: ReturnType<typeof diContainer.createChildContainer>): Scheme =>
    ({ container }) as unknown as Scheme;

  it('exposes the host-supplied documents by type to `document-ref` fields', () => {
    registerGlobalTokens();
    const container = diContainer.createChildContainer();
    const documents = [
      { id: 't1', name: 'Clients', type: 'table' },
      { id: 'f1', name: 'main', type: 'function' },
    ];
    new IntegrationsModule([], undefined, undefined, undefined, undefined, (type) =>
      documents.filter((document) => document.type === type),
    ).register(buildScheme(container));

    const provider = resolveService(TOKEN_DOCUMENTS_PROVIDER, container);
    expect(provider.getDocuments('table').map((document) => document.id)).toEqual(['t1']);
  });

  it('lists nothing when the host supplies no provider', () => {
    registerGlobalTokens();
    const container = diContainer.createChildContainer();
    new IntegrationsModule([]).register(buildScheme(container));
    expect(resolveService(TOKEN_DOCUMENTS_PROVIDER, container).getDocuments('table')).toEqual([]);
  });
});
