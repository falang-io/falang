import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { IntegrationsRegistryStore } from './integrations-registry.store.js';

const telegramIntegration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [
    {
      name: 'telegram-trigger',
      label: 'On message',
      notes: 'Fires for every incoming message.',
      scopeType: { type: 'any' },
      scopeVariableName: 'message',
      signalName: 'telegramMessage',
      webhookPath: '/x',
    },
  ],
  actions: [
    {
      name: 'telegram-send-message',
      label: 'Send message',
      fields: [],
      emit: () => '',
      activityCode: '',
      activitySignature: 'telegramSendMessage(): Promise<void>',
    },
  ],
  questions: [
    {
      name: 'telegram-question',
      label: 'Ask question',
      contextFields: [],
      questionFields: [],
      answerSignalName: 'telegramQuestionAnswer',
      askActivitySignature: 'telegramAskQuestion(): Promise<{ messageId: string }>',
      askActivityCode: '',
      resolveActivitySignature: 'telegramResolveQuestionAnswer(): Promise<void>',
      resolveActivityCode: '',
    },
  ],
  choices: [
    {
      name: 'call-ai-choice',
      label: 'Ask AI (choice)',
      contextFields: [],
      promptFields: [],
      activitySignature: 'callAiChoice(): Promise<{ action: string; data: unknown }>',
      activityCode: '',
    },
  ],
};

describe('IntegrationsRegistryStore', () => {
  it('finds an action descriptor by node name', () => {
    const registry = new IntegrationsRegistryStore([telegramIntegration]);
    expect(registry.findAction('telegram-send-message')?.label).toBe('Send message');
  });

  it('finds a trigger descriptor by node name', () => {
    const registry = new IntegrationsRegistryStore([telegramIntegration]);
    expect(registry.findTrigger('telegram-trigger')?.label).toBe('On message');
  });

  it('finds a question descriptor by node name', () => {
    const registry = new IntegrationsRegistryStore([telegramIntegration]);
    expect(registry.findQuestion('telegram-question')?.label).toBe('Ask question');
  });

  it('finds a choice descriptor by node name', () => {
    const registry = new IntegrationsRegistryStore([telegramIntegration]);
    expect(registry.findChoice('call-ai-choice')?.label).toBe('Ask AI (choice)');
  });

  it('returns undefined for an unregistered node name', () => {
    const registry = new IntegrationsRegistryStore([telegramIntegration]);
    expect(registry.findAction('slack-send-message')).toBeUndefined();
    expect(registry.findTrigger('slack-trigger')).toBeUndefined();
    expect(registry.findQuestion('slack-question')).toBeUndefined();
    expect(registry.findChoice('slack-choice')).toBeUndefined();
  });

  it('returns undefined for a vendor with no questions/choices declared', () => {
    const { questions: _questions, choices: _choices, ...bare } = telegramIntegration;
    const registry = new IntegrationsRegistryStore([bare]);
    expect(registry.findQuestion('telegram-question')).toBeUndefined();
    expect(registry.findChoice('call-ai-choice')).toBeUndefined();
  });
});
