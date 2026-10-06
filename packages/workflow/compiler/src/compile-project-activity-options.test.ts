import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';

// ADR 0038 (private) §3 — per-activity Temporal options grouping.

const functionNode = (id: string, bodyChildren: INode[] = []): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: bodyChildren },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

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

describe('compileProject with activityOptions', () => {
  it('keeps the default (no activityOptions anywhere) group text exactly as before', () => {
    const fn = functionNode('doc-fn', [{ id: 'l1', name: 'log', data: 'hi' }]);

    const result = compileProject({ documents: [functionDocument('doc-fn', 'run', fn)] });

    expect(result.workflows).toContain(
      [
        'const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({',
        "  startToCloseTimeout: '10 seconds',",
        '});',
      ].join('\n'),
    );
    expect(result.workflows).not.toContain('proxyActivities<');
  });

  it('groups two vendors with different activityOptions into two separate proxyActivities blocks', () => {
    const vendorA: IWorkflowIntegration = {
      vendor: 'vendor-a',
      label: 'Vendor A',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [
        {
          name: 'vendor-a-action',
          label: 'Vendor A action',
          fields: [],
          emit: () => 'await vendorAAction();',
          activityCode: 'export const vendorAAction = async () => {};',
          activitySignature: 'vendorAAction(): Promise<void>',
          activityOptions: { kind: 'regular', startToCloseTimeout: '10 minutes', heartbeatTimeout: '1 minute' },
        },
      ],
    };
    const vendorB: IWorkflowIntegration = {
      vendor: 'vendor-b',
      label: 'Vendor B',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [
        {
          name: 'vendor-b-action',
          label: 'Vendor B action',
          fields: [],
          emit: () => 'await vendorBAction();',
          activityCode: 'export const vendorBAction = async () => {};',
          activitySignature: 'vendorBAction(): Promise<void>',
          activityOptions: {
            kind: 'regular',
            startToCloseTimeout: '30 minutes',
            retry: { maximumAttempts: 3, nonRetryableErrorTypes: ['ValidationError'] },
          },
        },
      ],
    };
    const fn = functionNode('doc-fn', [
      { id: 'a1', name: 'vendor-a-action', data: {} },
      { id: 'b1', name: 'vendor-b-action', data: {} },
    ]);

    const result = compileProject({
      documents: [functionDocument('doc-fn', 'run', fn)],
      integrations: [vendorA, vendorB],
    });

    expect(result.workflows).toContain(
      "import { condition, defineSignal, proxyActivities, proxyLocalActivities, proxySinks, setHandler } from '@temporalio/workflow';",
    );
    expect(result.workflows).toContain(
      [
        'const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({',
        "  startToCloseTimeout: '10 seconds',",
        '});',
      ].join('\n'),
    );
    expect(result.workflows).toContain(
      [
        'const { vendorAAction } = proxyActivities<{ vendorAAction(): Promise<void> }>({',
        "  startToCloseTimeout: '10 minutes',",
        "  heartbeatTimeout: '1 minute',",
        '});',
      ].join('\n'),
    );
    expect(result.workflows).toContain(
      [
        'const { vendorBAction } = proxyActivities<{ vendorBAction(): Promise<void> }>({',
        "  startToCloseTimeout: '30 minutes',",
        '  retry: { maximumAttempts: 3, nonRetryableErrorTypes: ["ValidationError"] },',
        '});',
      ].join('\n'),
    );
  });

  it('puts a question ask and resolve activities in the same group, driven by one activityOptions', () => {
    const integrationWithQuestion: IWorkflowIntegration = {
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
      questions: [
        {
          name: 'telegram-question',
          label: 'Ask question',
          contextFields: [{ name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' }],
          questionFields: [{ name: 'question', label: 'Question', kind: 'template-string' }],
          answerSignalName: 'telegramQuestionAnswer',
          askActivitySignature: 'telegramAskQuestion(credentialId: string): Promise<{ messageId: string }>',
          askActivityCode: 'export const telegramAskQuestion = async () => ({ messageId: "1" });',
          resolveActivitySignature:
            'telegramResolveQuestionAnswer(credentialId: string, messageId: string): Promise<void>',
          resolveActivityCode: 'export const telegramResolveQuestionAnswer = async () => {};',
          activityOptions: { kind: 'regular', startToCloseTimeout: '1 minute' },
        },
      ],
    };
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
      integrations: [integrationWithQuestion],
    });

    expect(result.workflows).toContain(
      [
        'const { telegramAskQuestion, telegramResolveQuestionAnswer } = proxyActivities<{ telegramAskQuestion(credentialId: string): Promise<{ messageId: string }>; telegramResolveQuestionAnswer(credentialId: string, messageId: string): Promise<void> }>({',
        "  startToCloseTimeout: '1 minute',",
        '});',
      ].join('\n'),
    );
  });
});
