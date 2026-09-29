import { describe, expect, it } from 'vitest';
import { loadIntegrationLabelResolver } from './resolve-integration-labels.js';
import type { IWorkflowIntegration } from './types.js';

const integration = (locales?: IWorkflowIntegration['locales']): IWorkflowIntegration => ({
  actions: [],
  credentialFields: [],
  label: 'vendor:label',
  notes: 'test vendor',
  triggers: [],
  vendor: 'vendor',
  ...(locales ? { locales } : {}),
});

const english = { default: { vendor: { action: { send: 'Send message' }, label: 'Vendor' } } };

describe('loadIntegrationLabelResolver', () => {
  it('resolves an i18n key through the vendor’s English locale', async () => {
    const resolve = await loadIntegrationLabelResolver(integration({ en: () => Promise.resolve(english) }));
    expect(resolve('vendor:label')).toBe('Vendor');
    expect(resolve('vendor:action.send')).toBe('Send message');
  });

  it('keeps literal labels, unknown keys and non-string entries unchanged', async () => {
    const resolve = await loadIntegrationLabelResolver(integration({ en: () => Promise.resolve(english) }));
    expect(resolve('Send an e-mail')).toBe('Send an e-mail');
    expect(resolve('vendor:action.missing')).toBe('vendor:action.missing');
    expect(resolve('vendor:action')).toBe('vendor:action');
    expect(resolve('other:label')).toBe('other:label');
  });

  it('is the identity without locales or when the loader fails', async () => {
    expect((await loadIntegrationLabelResolver(integration()))('vendor:label')).toBe('vendor:label');
    const failing = integration({ en: () => Promise.reject(new Error('boom')) });
    expect((await loadIntegrationLabelResolver(failing))('vendor:label')).toBe('vendor:label');
  });
});
