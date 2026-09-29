import { describe, expect, it } from 'vitest';
import type { IActionDescriptor, ITriggerDescriptor } from './types.js';
import { buildActionNodeConfig, buildTriggerNodeConfig, getIntegrationNodeConfigs } from './build-node-config.js';
import type { IWorkflowIntegration } from './types.js';

const sendMessageAction: IActionDescriptor = {
  name: 'telegram-send-message',
  label: 'Send message',
  fields: [
    { name: 'credentialId', label: 'Credential', kind: 'credential-ref', vendor: 'telegram' },
    { name: 'chatId', label: 'Chat ID', kind: 'expression' },
    { name: 'text', label: 'Text', kind: 'expression' },
  ],
  emit: (fields) => `await telegramSendMessage(${fields.credentialId}, ${fields.chatId}, ${fields.text});`,
  activityCode: '',
  activitySignature: 'telegramSendMessage(credentialId: string, chatId: string, text: string): Promise<void>',
};

const onMessageTrigger: ITriggerDescriptor = {
  name: 'telegram-trigger',
  label: 'On message',
  notes: 'Fires for every incoming message.',
  scopeType: { type: 'any' },
  scopeVariableName: 'message',
  signalName: 'telegramMessage',
  webhookPath: '/webhooks/telegram/:credentialId/:env',
};

describe('buildActionNodeConfig', () => {
  it('derives a zod object schema from the descriptor fields', () => {
    const config = buildActionNodeConfig(sendMessageAction);
    expect(config.name).toBe('telegram-send-message');
    const parsed = config.data?.type.parse({ credentialId: 'cred-1', chatId: 'msg.chat.id', text: '`hi`' });
    expect(parsed).toEqual({ credentialId: 'cred-1', chatId: 'msg.chat.id', text: '`hi`' });
  });

  it('rejects data missing a declared field', () => {
    const config = buildActionNodeConfig(sendMessageAction);
    expect(() => config.data?.type.parse({ credentialId: 'cred-1', chatId: 'msg.chat.id' })).toThrow();
  });

  it('defaults every field to an empty string', () => {
    const config = buildActionNodeConfig(sendMessageAction);
    expect(config.data?.default()).toEqual({ credentialId: '', chatId: '', text: '' });
  });
});

describe('buildTriggerNodeConfig', () => {
  it('produces a node config with no editable data', () => {
    const config = buildTriggerNodeConfig(onMessageTrigger);
    expect(config).toEqual({ name: 'telegram-trigger' });
  });
});

describe('getIntegrationNodeConfigs', () => {
  it('flattens triggers and actions from every registered integration', () => {
    const integration: IWorkflowIntegration = {
      vendor: 'telegram',
      label: 'Telegram',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [onMessageTrigger],
      actions: [sendMessageAction],
    };
    const configs = getIntegrationNodeConfigs([integration]);
    expect(configs.map((config) => config.name)).toEqual(['telegram-trigger', 'telegram-send-message']);
  });
});
