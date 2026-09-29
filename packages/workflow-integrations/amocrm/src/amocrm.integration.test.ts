import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { AMOCRM_CREATE_LEAD_NAME, AMOCRM_VENDOR, amocrmIntegration } from './amocrm.integration.js';

describe('amocrmIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([amocrmIntegration]);
    expect(configs.map((config) => config.name)).toEqual([AMOCRM_CREATE_LEAD_NAME]);
  });

  it('amocrm-create-lead data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(amocrmIntegration.actions[0]);
    const parsed = config.data?.type.parse({ credentialId: 'cred-1', name: '`New lead`', price: '1000' });
    expect(parsed).toEqual({ credentialId: 'cred-1', name: '`New lead`', price: '1000' });
  });

  it('emit() calls amocrmCreateLead with the resolved field expressions', () => {
    const emitted = amocrmIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      name: '`New lead`',
      price: '1000',
    });
    expect(emitted).toBe("await amocrmCreateLead('cred-1', `New lead`, 1000);");
  });

  it('declares the OAuth2 vendor-variance options amoCRM needs (see ADR 0017 (private))', () => {
    expect(amocrmIntegration.oauth2).toMatchObject({
      authUrl: 'https://www.amocrm.ru/oauth',
      tokenUrl: 'https://{accountDomain}/oauth2/access_token',
      tokenRequestFormat: 'json',
      accountDomainCallbackParam: 'referer',
      includeRedirectUriOnRefresh: true,
    });
  });

  it('credentialFields declares client_id/client_secret plus the hidden OAuth2 token fields', () => {
    expect(amocrmIntegration.credentialFields.map((field) => field.name)).toEqual([
      'client_id',
      'client_secret',
      'access_token',
      'refresh_token',
      'expires_at',
      'account_domain',
    ]);
    expect(amocrmIntegration.credentialFields.find((field) => field.name === 'access_token')?.hidden).toBe(true);
  });

  it('activityCode is a self-contained TS module fragment referencing the shared resolvers', () => {
    expect(amocrmIntegration.actions[0].activityCode).toContain('export const amocrmCreateLead');
    expect(amocrmIntegration.actions[0].activityCode).toContain('resolveAmoCrmAccessToken(credentialId)');
    expect(amocrmIntegration.actions[0].activityCode).toContain("resolveAmoCrmField(credentialId, 'account_domain')");
    expect(amocrmIntegration.actions[0].activityCode).toContain('/api/v4/leads');
  });

  it('sharedActivityCode imports resolveOAuth2AccessToken and inlines the runtime OAuth2 config verbatim', () => {
    expect(amocrmIntegration.sharedActivityCode).toContain(
      "import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';",
    );
    expect(amocrmIntegration.sharedActivityCode).toContain(
      JSON.stringify({
        tokenUrl: 'https://{accountDomain}/oauth2/access_token',
        tokenRequestFormat: 'json',
        accountDomainCallbackParam: 'referer',
        includeRedirectUriOnRefresh: true,
      }),
    );
    expect(amocrmIntegration.sharedActivityCode).toContain("resolveOAuth2AccessToken('amocrm', credentialId,");
  });

  it('vendor matches the constant used by the credential-ref field', () => {
    expect(amocrmIntegration.vendor).toBe(AMOCRM_VENDOR);
    expect(amocrmIntegration.actions[0].fields[0]).toMatchObject({ kind: 'credential-ref', vendor: AMOCRM_VENDOR });
  });
});
