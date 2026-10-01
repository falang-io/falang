/* oxlint-disable no-undefined, require-await, no-await-expression-member, no-promise-executor-return, consistent-function-scoping */
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadRegistry = async (flag: string | null) => {
  vi.resetModules();
  if (flag === null) delete process.env.ENABLE_SQLITE_INTEGRATION;
  else process.env.ENABLE_SQLITE_INTEGRATION = flag;
  return import('./registered-integrations.js');
};

describe('ENABLE_SQLITE_INTEGRATION', () => {
  const original = process.env.ENABLE_SQLITE_INTEGRATION;
  afterEach(() => {
    vi.resetModules();
    if (original === undefined) delete process.env.ENABLE_SQLITE_INTEGRATION;
    else process.env.ENABLE_SQLITE_INTEGRATION = original;
  });

  it('does not register the sqlite vendor by default', async () => {
    const { REGISTERED_INTEGRATIONS } = await loadRegistry(null);
    expect(REGISTERED_INTEGRATIONS.some((integration) => integration.vendor === 'sqlite')).toBe(false);
    // the network databases stay available
    expect(REGISTERED_INTEGRATIONS.some((integration) => integration.vendor === 'postgres')).toBe(true);
  });

  it('registers it only for the exact value "true"', async () => {
    expect((await loadRegistry('false')).REGISTERED_INTEGRATIONS.some((i) => i.vendor === 'sqlite')).toBe(false);
    expect((await loadRegistry('true')).REGISTERED_INTEGRATIONS.some((i) => i.vendor === 'sqlite')).toBe(true);
  });

  it('publishes the disabled vendors for the client and the document codec rejects them', async () => {
    const { getDisabledVendors } = await import('./optional-vendors.js');
    expect(getDisabledVendors({})).toEqual(['sqlite']);
    expect(getDisabledVendors({ ENABLE_SQLITE_INTEGRATION: 'true' })).toEqual([]);

    delete process.env.ENABLE_SQLITE_INTEGRATION;
    const { encodeIntegrationsDataForWrite } = await import('./credentials-codec.js');
    const { REGISTERED_INTEGRATIONS } = await import('./registered-integrations.js');
    expect(() =>
      encodeIntegrationsDataForWrite(
        { instances: [{ id: 'a', vendor: 'sqlite', name: 'x', fields: { connectionString: '/etc/passwd' } }] },
        null,
        REGISTERED_INTEGRATIONS,
        Buffer.alloc(32),
      ),
    ).toThrow(/disabled/);
  });
});
