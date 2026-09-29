import { describe, expect, it } from 'vitest';
import type { IIntegrationsDocumentData } from '@falang/workflow-integrations-common';
import { decryptSecret, deriveEncryptionKey } from './credentials-crypto.js';
import { applyOAuth2TokensToInstance } from './oauth2-tokens-codec.js';

const key = deriveEncryptionKey('test-key');

const data: IIntegrationsDocumentData = {
  instances: [
    {
      id: 'cred-1',
      vendor: 'activepieces-oauth',
      name: 'A',
      fields: { client_id: 'cid', access_token: { dev: '', prod: '' } },
    },
    { id: 'cred-2', vendor: 'activepieces-oauth', name: 'B', fields: { client_id: 'other' } },
  ],
};

describe('applyOAuth2TokensToInstance', () => {
  it('encrypts and writes access_token into only the targeted instance, leaving other instances untouched', () => {
    const result = applyOAuth2TokensToInstance(data, 'cred-1', { accessToken: 'tok-abc' }, key);

    const updated = result.instances.find((instance) => instance.id === 'cred-1');
    const accessToken = updated?.fields['access_token'];
    expect(typeof accessToken === 'object' && decryptSecret(accessToken.dev, key)).toBe('tok-abc');
    expect(typeof accessToken === 'object' && accessToken.prod).toBe('');
    expect(updated?.fields['client_id']).toBe('cid');

    expect(result.instances.find((instance) => instance.id === 'cred-2')).toEqual(data.instances[1]);
  });

  it('only writes refresh_token/expires_at/oauth_data/account_domain when provided', () => {
    const result = applyOAuth2TokensToInstance(data, 'cred-1', { accessToken: 'tok-abc' }, key);
    const updated = result.instances.find((instance) => instance.id === 'cred-1');
    expect(updated?.fields['refresh_token']).toBeUndefined();
    expect(updated?.fields['expires_at']).toBeUndefined();
    expect(updated?.fields['oauth_data']).toBeUndefined();
    expect(updated?.fields['account_domain']).toBeUndefined();
  });

  it('writes account_domain as a plain string when given', () => {
    const result = applyOAuth2TokensToInstance(
      data,
      'cred-1',
      { accessToken: 'tok-abc', accountDomain: 'my-account.amocrm.ru' },
      key,
    );
    const updated = result.instances.find((instance) => instance.id === 'cred-1');
    expect(updated?.fields['account_domain']).toBe('my-account.amocrm.ru');
  });

  it('writes refresh_token/expires_at/oauth_data when given', () => {
    const result = applyOAuth2TokensToInstance(
      data,
      'cred-1',
      { accessToken: 'tok-abc', refreshToken: 'refresh-1', expiresAt: '12345', oauthData: '{"a":1}' },
      key,
    );
    const updated = result.instances.find((instance) => instance.id === 'cred-1');
    const refreshToken = updated?.fields['refresh_token'];
    expect(typeof refreshToken === 'object' && decryptSecret(refreshToken.dev, key)).toBe('refresh-1');
    expect(updated?.fields['expires_at']).toBe('12345');
    expect(updated?.fields['oauth_data']).toBe('{"a":1}');
  });

  it('leaves the data unchanged when no instance matches credentialId', () => {
    const result = applyOAuth2TokensToInstance(data, 'unknown-cred', { accessToken: 'tok-abc' }, key);
    expect(result).toEqual(data);
  });
});
