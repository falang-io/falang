import type { INode } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileTriggerFunction } from './compile-trigger-function.js';

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
      webhookPath: '/webhooks/telegram/:credentialId/:env',
    },
  ],
  actions: [
    {
      name: 'telegram-send-message',
      label: 'Send message',
      fields: [
        { name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' },
        { name: 'chatId', label: 'Chat ID', kind: 'expression' },
        { name: 'text', label: 'Text', kind: 'expression' },
      ],
      emit: (fields) => `await telegramSendMessage(${fields.credentialId}, ${fields.chatId}, ${fields.text});`,
      activityCode: '',
      activitySignature: 'telegramSendMessage(credentialId: string, chatId: string, text: string): Promise<void>',
    },
  ],
};

const scheduleIntegration: IWorkflowIntegration = {
  vendor: 'schedule',
  label: 'Schedule',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [
    {
      name: 'schedule-interval',
      label: 'Every N minutes',
      notes: 'Fires on a fixed interval.',
      // Real vendor payload is `schedule/Fire` (`{ scheduledAt: string, timezone: string }`, a
      // struct — see ADR 0037 (private) §2); `any` is enough here since this test only asserts on
      // the emitted source text, never actually type-checks it.
      scopeType: { type: 'any' },
      scopeVariableName: 'fire',
      signalName: 'scheduleFire',
      webhookPath: '/webhooks/schedule/:credentialId/:env',
      delivery: 'start',
    },
  ],
  actions: [],
};

const buildScheduleTriggerFunctionNode = (bodyChildren: readonly INode[] = []): INode => ({
  id: 'fn1',
  name: 'trigger-function',
  children: [
    { id: 'header', name: 'function-header', data: '' },
    {
      id: 'body',
      name: 'trigger-function-body',
      data: { vendor: 'schedule', triggerName: 'schedule-interval', credentialId: 'schedule' },
      children: bodyChildren,
    },
    { id: 'footer', name: 'function-footer', data: '' },
  ],
});

const defaultBodyChildren: readonly INode[] = [
  {
    id: 'send1',
    name: 'telegram-send-message',
    data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: '`hi`' },
  },
];

const buildTriggerFunctionNode = (
  bodyChildren: readonly INode[] = defaultBodyChildren,
  bodyDataOverrides: Record<string, unknown> = {},
): INode => ({
  id: 'fn1',
  name: 'trigger-function',
  children: [
    { id: 'header', name: 'function-header', data: '' },
    {
      id: 'body',
      name: 'trigger-function-body',
      data: { vendor: 'telegram', triggerName: 'telegram-trigger', credentialId: 'cred-1', ...bodyDataOverrides },
      children: bodyChildren,
    },
    { id: 'footer', name: 'function-footer', data: '' },
  ],
});

describe('compileTriggerFunction', () => {
  it('compiles a signal-wait preamble followed by the body statements', () => {
    const result = compileTriggerFunction(buildTriggerFunctionNode(), 'onMessage', [telegramIntegration]);
    expect(result).toBe(
      [
        'export async function onMessage(): Promise<void> {',
        "  const onMessageSignal = defineSignal<[any]>('telegramMessage');",
        '',
        '  let message!: any;',
        '  let hasSignal = false;',
        '  setHandler(onMessageSignal, (payload: any) => {',
        '    message = payload;',
        '    hasSignal = true;',
        '  });',
        '  await condition(() => hasSignal);',
        '  // icon-start:telegram-send-message:send1',
        '  await telegramSendMessage("cred-1", message.chat.id, `hi`);',
        '  // icon-end:telegram-send-message:send1',
        '}',
      ].join('\n'),
    );
  });

  it('throws when bound to a vendor/trigger not present in the given integrations', () => {
    expect(() => compileTriggerFunction(buildTriggerFunctionNode(), 'onMessage', [])).toThrow(/unknown trigger/);
  });

  it('honors a declared returnValue instead of defaulting to void', () => {
    const node = buildTriggerFunctionNode(defaultBodyChildren, { returnValue: { type: 'boolean' } });
    const result = compileTriggerFunction(node, 'onMessage', [telegramIntegration]);
    expect(result).toContain('Promise<boolean>');
  });

  it('threads resolveFunctionName through to call-function nodes in the body', () => {
    const node = buildTriggerFunctionNode([
      { id: 'call1', name: 'call-function', data: { schemeId: 'other-doc', parameters: [], returnVariable: '' } },
    ]);
    const result = compileTriggerFunction(node, 'onMessage', [telegramIntegration], {
      resolveFunctionName: () => 'helperFn',
    });
    expect(result).toContain('await helperFn();');
  });

  it('compiles a delivery: "start" trigger as a payload-argument preamble, not a signal wait', () => {
    const result = compileTriggerFunction(
      buildScheduleTriggerFunctionNode([{ id: 'log1', name: 'log', data: 'fire.scheduledAt' }]),
      'onFire',
      [scheduleIntegration],
    );
    expect(result).toBe(
      [
        'export async function onFire(payload: any): Promise<void> {',
        "  const __falangScheduledStart = workflowInfo().searchAttributes['TemporalScheduledStartTime']?.[0] as Date | undefined;",
        '  const fire: any = { ...payload, scheduledAt: (__falangScheduledStart ?? new Date()).toISOString() };',
        '  // icon-start:log:log1',
        '  await logActivity(`fire.scheduledAt`);',
        '  // icon-end:log:log1',
        '}',
      ].join('\n'),
    );
  });
});
