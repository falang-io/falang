import { BlockList } from 'node:net';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as EgressGuardModule from '../../net/egress-guard.js';
import { createBackendEgress } from '../../net/egress-guard.js';
import { resolveOAuth2AccessToken } from './resolve-oauth2-access-token.js';

// An account domain whose DNS points into the internal network (10.0.0.1).
vi.mock('../../net/egress-guard.js', async (importOriginal) => {
  const original = await importOriginal<typeof EgressGuardModule>();
  const egress = original.createBackendEgress({
    policy: () => ({ allowPrivate: false, allowed: new BlockList() }),
    lookupAll: () => Promise.resolve([{ address: '10.0.0.1', family: 4 }]),
  });
  return { ...original, getBackendEgress: () => egress };
});

vi.mock('./credentials-codec.js', () => ({
  resolveFieldValue: (_instance: unknown, field: { name: string }) =>
    ({ access_token: 'old', refresh_token: 'r', expires_at: '1', account_domain: 'acc.amocrm.test' })[field.name] ?? '',
}));
vi.mock('./resolve-oauth2-client-credentials.js', () => ({
  resolveOAuth2ClientCredentials: () => Promise.resolve({ clientId: 'cid', clientSecret: 'secret' }),
}));

const integration = {
  vendor: 'amo-test',
  credentialFields: ['access_token', 'refresh_token', 'expires_at', 'account_domain'].map((name) => ({ name })),
  oauth2: {
    tokenUrl: 'https://{accountDomain}/oauth2/access_token',
    authorizationMethod: 'BODY',
    tokenRequestFormat: 'json',
    accountDomainCallbackParam: 'referer',
    accountDomainSuffixes: ['.amocrm.test'],
  },
} as unknown as IWorkflowIntegration;

describe('resolveOAuth2AccessToken egress', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses a refresh to an account domain that resolves to a private address', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: 'x' }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(createBackendEgress).toBeTypeOf('function');
    await expect(
      resolveOAuth2AccessToken({} as never, integration, {} as IIntegrationInstance, Buffer.alloc(32), 1_000_000),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
