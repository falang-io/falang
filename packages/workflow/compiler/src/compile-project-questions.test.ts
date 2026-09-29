import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';

const telegramIntegrationWithQuestion: IWorkflowIntegration = {
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
      webhookPath: '/webhooks/telegram/:credentialId/:env',
    },
  ],
  actions: [],
  sharedActivityCode: 'const resolveTelegramBotToken = async () => "token";',
  questions: [
    {
      name: 'telegram-question',
      label: 'Ask question',
      contextFields: [{ name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' }],
      questionFields: [{ name: 'question', label: 'Question', kind: 'template-string' }],
      answerSignalName: 'telegramQuestionAnswer',
      askActivitySignature:
        'telegramAskQuestion(credentialId: string, question: string, options: readonly string[]): Promise<{ messageId: string }>',
      askActivityCode: 'export const telegramAskQuestion = async () => ({ messageId: "1" });',
      resolveActivitySignature:
        'telegramResolveQuestionAnswer(credentialId: string, messageId: string, selectedLabel: string): Promise<void>',
      resolveActivityCode: 'export const telegramResolveQuestionAnswer = async () => {};',
    },
  ],
};

const triggerFunctionNode = (id: string, bodyChildren: INode[] = []): INode => ({
  id,
  name: 'trigger-function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    {
      id: `${id}-body`,
      name: 'trigger-function-body',
      data: { vendor: 'telegram', triggerName: 'telegram-trigger', credentialId: 'cred-1' },
      children: bodyChildren,
    },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const triggerFunctionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'trigger-function',
  name,
  root,
});

describe('compileProject with questions', () => {
  it('proxies the ask/resolve activities and emits sharedActivityCode once, ahead of every per-activity code block', () => {
    const trigger = triggerFunctionNode('doc-trigger', [
      {
        id: 'q1',
        name: 'telegram-question',
        data: { credentialId: 'cred-1', question: 'Pick one', options: ['A'] },
        children: [{ id: 'q1-option-0', name: 'telegram-question-option', data: { label: 'A' }, children: [] }],
      },
    ]);

    const result = compileProject({
      documents: [triggerFunctionDocument('doc-trigger', 'onMessage', trigger)],
      integrations: [telegramIntegrationWithQuestion],
    });

    expect(result.workflows).toContain('telegramAskQuestion(credentialId: string, question: string');
    expect(result.workflows).toContain('telegramResolveQuestionAnswer(credentialId: string, messageId: string');
    expect(result.workflows).toContain('switch (q_q1Answer)');

    const sharedIndex = result.activities.indexOf('const resolveTelegramBotToken');
    const askIndex = result.activities.indexOf('export const telegramAskQuestion');
    const resolveIndex = result.activities.indexOf('export const telegramResolveQuestionAnswer');
    expect(sharedIndex).toBeGreaterThanOrEqual(0);
    expect(sharedIndex).toBeLessThan(askIndex);
    expect(askIndex).toBeLessThan(resolveIndex);
  });
});
