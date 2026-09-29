import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { DIADOC_GET_DOCUMENTS_NAME, DIADOC_VENDOR, diadocIntegration } from './diadoc.integration.js';

describe('diadocIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([diadocIntegration]);
    expect(configs.map((config) => config.name)).toEqual([DIADOC_GET_DOCUMENTS_NAME]);
  });

  it('diadoc-get-documents data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(diadocIntegration.actions[0]);
    const parsed = config.data?.type.parse({ credentialId: 'cred-1', resultVariable: 'documents' });
    expect(parsed).toEqual({ credentialId: 'cred-1', resultVariable: 'documents' });
  });

  it('emit() calls diadocGetDocuments with the resolved field expression and assigns the result', () => {
    const emitted = diadocIntegration.actions[0].emit({ credentialId: "'cred-1'", resultVariable: 'documents' });
    expect(emitted).toBe("const documents = await diadocGetDocuments('cred-1');");
  });

  it('emit() omits the assignment when resultVariable is empty (node created but not yet configured)', () => {
    const emitted = diadocIntegration.actions[0].emit({ credentialId: "'cred-1'", resultVariable: '' });
    expect(emitted).toBe("await diadocGetDocuments('cred-1');");
  });

  it('declares plain RFC 6749 OAuth2 config — no amoCRM-shaped deviations needed (see ADR 0017 (private))', () => {
    expect(diadocIntegration.oauth2).toMatchObject({
      authUrl: 'https://identity.kontur.ru/connect/authorize',
      tokenUrl: 'https://identity.kontur.ru/connect/token',
      scope: ['openid', 'profile', 'email', 'offline_access', 'Diadoc.PublicAPI'],
    });
    expect(diadocIntegration.oauth2?.tokenRequestFormat).toBeUndefined();
    expect(diadocIntegration.oauth2?.accountDomainCallbackParam).toBeUndefined();
    expect(diadocIntegration.oauth2?.includeRedirectUriOnRefresh).toBeUndefined();
  });

  it('credentialFields declares client_id/client_secret, the hidden OAuth2 token fields, and a plain box_id', () => {
    expect(diadocIntegration.credentialFields.map((field) => field.name)).toEqual([
      'client_id',
      'client_secret',
      'access_token',
      'refresh_token',
      'expires_at',
      'box_id',
    ]);
    expect(diadocIntegration.credentialFields.find((field) => field.name === 'access_token')?.hidden).toBe(true);
    expect(diadocIntegration.credentialFields.find((field) => field.name === 'box_id')?.hidden).toBeUndefined();
  });

  it('activityCode is a self-contained TS module fragment referencing the shared resolvers', () => {
    expect(diadocIntegration.actions[0].activityCode).toContain('export const diadocGetDocuments');
    expect(diadocIntegration.actions[0].activityCode).toContain('resolveDiadocAccessToken(credentialId)');
    expect(diadocIntegration.actions[0].activityCode).toContain("resolveDiadocField(credentialId, 'box_id')");
    expect(diadocIntegration.actions[0].activityCode).toContain('diadoc-api.kontur.ru/V4/GetDocuments');
  });

  it('sharedActivityCode imports resolveOAuth2AccessToken and inlines the runtime OAuth2 config verbatim', () => {
    expect(diadocIntegration.sharedActivityCode).toContain(
      "import { resolveOAuth2AccessToken } from '@falang/workflow-integrations-common';",
    );
    expect(diadocIntegration.sharedActivityCode).toContain(
      JSON.stringify({ tokenUrl: 'https://identity.kontur.ru/connect/token' }),
    );
    expect(diadocIntegration.sharedActivityCode).toContain("resolveOAuth2AccessToken('diadoc', credentialId,");
  });

  it('sharedActivityCode resolves box_id env-aware (dev/prod), not hardcoded to dev', () => {
    expect(diadocIntegration.sharedActivityCode).toContain('const resolveDiadocField');
    expect(diadocIntegration.sharedActivityCode).toContain("process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev'");
    expect(diadocIntegration.sharedActivityCode).toContain("vendor: 'diadoc'");
  });

  it('declares no trigger — action-only, like amoCRM/GigaChat/1С', () => {
    expect(diadocIntegration.triggers).toEqual([]);
  });

  it('vendor matches the constant used by the credential-ref field', () => {
    expect(diadocIntegration.vendor).toBe(DIADOC_VENDOR);
    expect(diadocIntegration.actions[0].fields[0]).toMatchObject({ kind: 'credential-ref', vendor: DIADOC_VENDOR });
  });
});
