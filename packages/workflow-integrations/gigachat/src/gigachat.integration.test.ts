import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { GIGACHAT_CALL_TEXT_NAME, GIGACHAT_VENDOR, gigachatIntegration } from './gigachat.integration.js';

describe('gigachatIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([gigachatIntegration]);
    expect(configs.map((config) => config.name)).toEqual([GIGACHAT_CALL_TEXT_NAME]);
  });

  it('gigachat-call-text data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(gigachatIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      credentialId: 'cred-1',
      model: 'GigaChat',
      prompt: '`hello`',
      resultVariable: 'reply',
    });
    expect(parsed).toEqual({ credentialId: 'cred-1', model: 'GigaChat', prompt: '`hello`', resultVariable: 'reply' });
  });

  it('gigachat-call-text opens in a sidebar, matching call-ai-text', () => {
    expect(gigachatIntegration.actions[0].editorType).toBe('sidebar');
  });

  it('emit() assigns the call to resultVariable when one is set', () => {
    const emitted = gigachatIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      model: "'GigaChat'",
      prompt: '`hello`',
      resultVariable: 'reply',
    });
    expect(emitted).toBe("const reply = await gigachatCallText('cred-1', 'GigaChat', `hello`);");
  });

  it('emit() omits the assignment when resultVariable is empty (never edited)', () => {
    const emitted = gigachatIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      model: "'GigaChat'",
      prompt: '`hello`',
      resultVariable: '',
    });
    expect(emitted).toBe("await gigachatCallText('cred-1', 'GigaChat', `hello`);");
  });

  it('does not declare an oauth2 config — client_credentials needs no interactive Connect flow', () => {
    expect(gigachatIntegration.oauth2).toBeUndefined();
  });

  it('credentialFields declares authKey/scope plus the hidden cached-token fields', () => {
    expect(gigachatIntegration.credentialFields.map((field) => field.name)).toEqual([
      'authKey',
      'scope',
      'access_token',
      'expires_at',
    ]);
    expect(gigachatIntegration.credentialFields.find((field) => field.name === 'access_token')?.hidden).toBe(true);
    expect(gigachatIntegration.credentialFields.find((field) => field.name === 'scope')?.options).toEqual([
      { value: 'GIGACHAT_API_PERS', label: 'Personal (GIGACHAT_API_PERS)' },
      { value: 'GIGACHAT_API_B2B', label: 'Business, prepaid (GIGACHAT_API_B2B)' },
      { value: 'GIGACHAT_API_CORP', label: 'Business, pay-as-you-go (GIGACHAT_API_CORP)' },
    ]);
  });

  it('activityCode is a self-contained TS module fragment calling the cached-token helper', () => {
    expect(gigachatIntegration.actions[0].activityCode).toContain('export const gigachatCallText');
    expect(gigachatIntegration.actions[0].activityCode).toContain('getGigaChatAccessToken(credentialId)');
    expect(gigachatIntegration.actions[0].activityCode).toContain('chat/completions');
  });

  it('sharedActivityCode declares the token endpoint, RqUID header, and cache-persist call', () => {
    expect(gigachatIntegration.sharedActivityCode).toContain('https://ngw.devices.sberbank.ru:9443/api/v2/oauth');
    expect(gigachatIntegration.sharedActivityCode).toContain('RqUID: crypto.randomUUID()');
    expect(gigachatIntegration.sharedActivityCode).toContain('/internal/credentials/oauth2-refresh');
    expect(gigachatIntegration.sharedActivityCode).toContain('const getGigaChatAccessToken');
  });

  it('vendor matches the constant used by the credential-ref field', () => {
    expect(gigachatIntegration.vendor).toBe(GIGACHAT_VENDOR);
    expect(gigachatIntegration.actions[0].fields[0]).toMatchObject({ kind: 'credential-ref', vendor: GIGACHAT_VENDOR });
  });
});
