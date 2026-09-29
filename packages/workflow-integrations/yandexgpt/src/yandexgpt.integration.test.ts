import { buildActionNodeConfig, getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { YANDEXGPT_CALL_TEXT_NAME, YANDEXGPT_VENDOR, yandexgptIntegration } from './yandexgpt.integration.js';

describe('yandexgptIntegration', () => {
  it('produces valid node configs through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([yandexgptIntegration]);
    expect(configs.map((config) => config.name)).toEqual([YANDEXGPT_CALL_TEXT_NAME]);
  });

  it('yandexgpt-call-text data schema accepts the declared fields', () => {
    const config = buildActionNodeConfig(yandexgptIntegration.actions[0]);
    const parsed = config.data?.type.parse({
      credentialId: 'cred-1',
      model: 'yandexgpt/latest',
      prompt: 'Hello',
      resultVariable: 'answer',
    });
    expect(parsed).toEqual({
      credentialId: 'cred-1',
      model: 'yandexgpt/latest',
      prompt: 'Hello',
      resultVariable: 'answer',
    });
  });

  it('emit() calls yandexgptCallText with the resolved field expressions and assigns the result', () => {
    const emitted = yandexgptIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      model: "'yandexgpt/latest'",
      prompt: '`Hello`',
      resultVariable: 'answer',
    });
    expect(emitted).toBe("const answer = await yandexgptCallText('cred-1', 'yandexgpt/latest', `Hello`);");
  });

  it('emit() omits the assignment when resultVariable is empty (node created but not yet configured)', () => {
    const emitted = yandexgptIntegration.actions[0].emit({
      credentialId: "'cred-1'",
      model: "'yandexgpt/latest'",
      prompt: '`Hello`',
      resultVariable: '',
    });
    expect(emitted).toBe("await yandexgptCallText('cred-1', 'yandexgpt/latest', `Hello`);");
  });

  it('credentialFields declares apiKey/folderId, with only apiKey a secret', () => {
    expect(yandexgptIntegration.credentialFields).toEqual([
      { name: 'apiKey', label: 'API key', kind: 'secret' },
      { name: 'folderId', label: 'Folder ID', kind: 'text' },
    ]);
  });

  it('declares no trigger — action-only, like amoCRM/GigaChat/OpenAI', () => {
    expect(yandexgptIntegration.triggers).toEqual([]);
  });

  it('activityCode builds a folder-scoped modelUri and uses the Api-Key auth scheme, not Bearer', () => {
    expect(yandexgptIntegration.actions[0].activityCode).toContain('export const yandexgptCallText');
    expect(yandexgptIntegration.actions[0].activityCode).toContain('modelUri: `gpt://${folderId}/${model}`');
    expect(yandexgptIntegration.actions[0].activityCode).toContain('Authorization: `Api-Key ${apiKey}`');
    expect(yandexgptIntegration.actions[0].activityCode).toContain(
      'llm.api.cloud.yandex.net/foundationModels/v1/completion',
    );
  });

  it('response parsing reads the un-wrapped alternatives array, not a result.alternatives wrapper', () => {
    expect(yandexgptIntegration.actions[0].activityCode).toContain("data.alternatives[0]?.message.text ?? ''");
    expect(yandexgptIntegration.actions[0].activityCode).not.toContain('result.alternatives');
  });

  it('sharedActivityCode resolves credential fields env-aware (dev/prod), not hardcoded to dev', () => {
    expect(yandexgptIntegration.sharedActivityCode).toContain('const resolveYandexGptField');
    expect(yandexgptIntegration.sharedActivityCode).toContain("process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev'");
    expect(yandexgptIntegration.sharedActivityCode).toContain("vendor: 'yandexgpt'");
  });

  it('vendor matches the constant used by the credential-ref field', () => {
    expect(yandexgptIntegration.vendor).toBe(YANDEXGPT_VENDOR);
    expect(yandexgptIntegration.actions[0].fields[0]).toMatchObject({
      kind: 'credential-ref',
      vendor: YANDEXGPT_VENDOR,
    });
  });
});
