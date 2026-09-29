import { describe, expect, it } from 'vitest';
import { buildOAuth2TokenRequest, resolveOAuth2TokenUrl } from './oauth2-token-request.js';

describe('resolveOAuth2TokenUrl', () => {
  it('returns tokenUrl verbatim when accountDomainCallbackParam is not set', () => {
    expect(resolveOAuth2TokenUrl({ tokenUrl: 'https://vendor.test/token' }, null)).toBe('https://vendor.test/token');
  });

  it('substitutes the {accountDomain} placeholder when accountDomainCallbackParam is set', () => {
    const oauth2 = { tokenUrl: 'https://{accountDomain}/oauth2/access_token', accountDomainCallbackParam: 'referer' };
    expect(resolveOAuth2TokenUrl(oauth2, 'my-account.amocrm.ru')).toBe(
      'https://my-account.amocrm.ru/oauth2/access_token',
    );
  });

  it('throws when accountDomainCallbackParam is set but no account domain was captured', () => {
    const oauth2 = { tokenUrl: 'https://{accountDomain}/oauth2/access_token', accountDomainCallbackParam: 'referer' };
    expect(() => resolveOAuth2TokenUrl(oauth2, null)).toThrow(/account domain is required/);
  });
});

describe('buildOAuth2TokenRequest', () => {
  it('builds a form-urlencoded request with client_id/client_secret in the body by default', () => {
    const { url, init } = buildOAuth2TokenRequest({ tokenUrl: 'https://vendor.test/token' }, 'cid', 'csecret', {
      grant_type: 'authorization_code',
      code: 'abc',
    });
    expect(url).toBe('https://vendor.test/token');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
    const body = init.body as URLSearchParams;
    expect(body.get('client_id')).toBe('cid');
    expect(body.get('client_secret')).toBe('csecret');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code')).toBe('abc');
  });

  it('sends client_id/client_secret as an HTTP Basic header when authorizationMethod is HEADER', () => {
    const { init } = buildOAuth2TokenRequest(
      { tokenUrl: 'https://vendor.test/token', authorizationMethod: 'HEADER' },
      'cid',
      'csecret',
      { grant_type: 'refresh_token', refresh_token: 'r1' },
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from('cid:csecret').toString('base64')}`);
    const body = init.body as URLSearchParams;
    expect(body.get('client_id')).toBeNull();
    expect(body.get('client_secret')).toBeNull();
  });

  it('builds a JSON request body when tokenRequestFormat is "json" (amoCRM)', () => {
    const { init } = buildOAuth2TokenRequest(
      { tokenUrl: 'https://vendor.test/token', tokenRequestFormat: 'json' },
      'cid',
      'csecret',
      { grant_type: 'authorization_code', code: 'abc', redirect_uri: 'https://backend.test/oauth2/callback/amocrm' },
    );
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      grant_type: 'authorization_code',
      code: 'abc',
      redirect_uri: 'https://backend.test/oauth2/callback/amocrm',
      client_id: 'cid',
      client_secret: 'csecret',
    });
  });

  it('resolves a per-account {accountDomain} tokenUrl when accountDomain is passed', () => {
    const { url } = buildOAuth2TokenRequest(
      { tokenUrl: 'https://{accountDomain}/oauth2/access_token', accountDomainCallbackParam: 'referer' },
      'cid',
      'csecret',
      { grant_type: 'refresh_token', refresh_token: 'r1' },
      'my-account.amocrm.ru',
    );
    expect(url).toBe('https://my-account.amocrm.ru/oauth2/access_token');
  });
});
