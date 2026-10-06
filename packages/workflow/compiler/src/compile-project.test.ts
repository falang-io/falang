// oxlint-disable max-lines -- whole-module expectations include the journal runtime preamble (ADR 0059 (private)).
import { buildJournalRuntimeCode } from './journal-runtime.js';
import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';

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

describe('compileProject', () => {
  it('resolves call-function across documents and exports every function document', () => {
    const caller = functionNode('doc-caller', [
      {
        id: 'c1',
        name: 'call-function',
        data: { schemeId: 'doc-callee', parameters: ['"eu"'], returnVariable: 'shippingCost' },
      },
      { id: 'l1', name: 'log', data: 'shippingCost' },
    ]);
    const callee = functionNode('doc-callee', [{ id: 'l2', name: 'log', data: 'calc' }]);

    const result = compileProject({
      documents: [
        functionDocument('doc-caller', 'processOrder', caller),
        functionDocument('doc-callee', 'calculateShipping', callee),
      ],
    });

    expect(result.workflows).toBe(
      [
        "import { condition, defineSignal, proxyLocalActivities, proxySinks, setHandler } from '@temporalio/workflow';",
        '',
        'const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({',
        "  startToCloseTimeout: '10 seconds',",
        '});',
        '',
        ...buildJournalRuntimeCode(false).split('\n'),
        '',
        '// doc-start:processOrder:doc-caller',
        'export async function processOrder(): Promise<void> {',
        '  // icon-start:call-function:c1',
        '  const shippingCost = await calculateShipping("eu");',
        '  // icon-end:call-function:c1',
        '  // icon-start:log:l1',
        "  __falangJournal({ kind: 'log', level: 'info', message: `shippingCost` });",
        '  // icon-end:log:l1',
        '}',
        '// doc-end:processOrder:doc-caller',
        '',
        '// doc-start:calculateShipping:doc-callee',
        'export async function calculateShipping(): Promise<void> {',
        '  // icon-start:log:l2',
        "  __falangJournal({ kind: 'log', level: 'info', message: `calc` });",
        '  // icon-end:log:l2',
        '}',
        '// doc-end:calculateShipping:doc-callee',
      ].join('\n'),
    );
    // The activities module is a separate compiled output — see compile-activities.test.ts for its content.
    expect(result.activities).toContain('export const logActivity');
  });

  it('compiles a call-function with several differently-typed parameters, matching the target signature in order', () => {
    const producerBody: INode = {
      id: 'producer-body',
      name: 'function-body',
      data: {
        parameters: [
          { name: 'orderId', type: { type: 'string' } },
          { name: 'count', type: { type: 'number', numberType: { type: 'any' } } },
        ],
      },
      children: [],
    };
    const producer: INode = {
      id: 'doc-producer',
      name: 'function',
      children: [
        { id: 'producer-header', name: 'function-header', data: '' },
        producerBody,
        { id: 'producer-footer', name: 'function-footer', data: '' },
      ],
    };
    const consumer = functionNode('doc-consumer', [
      {
        id: 'c1',
        name: 'call-function',
        data: { schemeId: 'doc-producer', parameters: ['"ORD-1"', '42'], returnVariable: '' },
      },
    ]);

    const result = compileProject({
      documents: [
        functionDocument('doc-consumer', 'consumer', consumer),
        functionDocument('doc-producer', 'producer', producer),
      ],
    });

    expect(result.workflows).toBe(
      [
        "import { condition, defineSignal, proxyLocalActivities, proxySinks, setHandler } from '@temporalio/workflow';",
        '',
        'const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({',
        "  startToCloseTimeout: '10 seconds',",
        '});',
        '',
        ...buildJournalRuntimeCode(false).split('\n'),
        '',
        '// doc-start:consumer:doc-consumer',
        'export async function consumer(): Promise<void> {',
        '  // icon-start:call-function:c1',
        '  await producer("ORD-1", 42);',
        '  // icon-end:call-function:c1',
        '}',
        '// doc-end:consumer:doc-consumer',
        '',
        '// doc-start:producer:doc-producer',
        'export async function producer(orderId: string, count: number): Promise<void> {',
        '',
        '}',
        '// doc-end:producer:doc-producer',
      ].join('\n'),
    );
  });

  it('throws when a call-function targets a document not in the project', () => {
    const caller = functionNode('doc-caller', [
      { id: 'c1', name: 'call-function', data: { schemeId: 'missing', parameters: [], returnVariable: '' } },
    ]);

    expect(() => compileProject({ documents: [functionDocument('doc-caller', 'run', caller)] })).toThrow(/missing/);
  });

  it('skips non-function documents (e.g. objects-structure type metadata)', () => {
    const caller = functionNode('doc-caller', [{ id: 'l1', name: 'log', data: 'hi' }]);

    const result = compileProject({
      documents: [
        functionDocument('doc-caller', 'run', caller),
        { id: 'doc-struct', type: 'objects-structure', name: 'Order', root: functionNode('doc-struct') },
      ],
    });

    expect(result.workflows).toBe(
      [
        "import { condition, defineSignal, proxyLocalActivities, proxySinks, setHandler } from '@temporalio/workflow';",
        '',
        'const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({',
        "  startToCloseTimeout: '10 seconds',",
        '});',
        '',
        ...buildJournalRuntimeCode(false).split('\n'),
        '',
        '// doc-start:run:doc-caller',
        'export async function run(): Promise<void> {',
        '  // icon-start:log:l1',
        "  __falangJournal({ kind: 'log', level: 'info', message: `hi` });",
        '  // icon-end:log:l1',
        '}',
        '// doc-end:run:doc-caller',
      ].join('\n'),
    );
  });

  it('throws when a function document has no root node', () => {
    expect(() => compileProject({ documents: [{ id: 'doc-1', type: 'function', name: 'run' }] })).toThrow(/root/);
  });
});

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
      activityCode: 'export const telegramSendMessage = async () => {};',
      activitySignature: 'telegramSendMessage(credentialId: string, chatId: string, text: string): Promise<void>',
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

describe('compileProject with integrations', () => {
  it('compiles a trigger-function alongside plain functions, proxying every activity in one preamble', () => {
    const trigger = triggerFunctionNode('doc-trigger', [
      {
        id: 'send1',
        name: 'telegram-send-message',
        data: { credentialId: 'cred-1', chatId: 'message.chat.id', text: '`hi`' },
      },
    ]);

    const result = compileProject({
      documents: [triggerFunctionDocument('doc-trigger', 'onMessage', trigger)],
      integrations: [telegramIntegration],
    });

    expect(result.workflows).toBe(
      [
        "import { condition, defineSignal, proxyLocalActivities, proxySinks, setHandler } from '@temporalio/workflow';",
        '',
        'const { logActivity, telegramSendMessage } = proxyLocalActivities<{ logActivity(message: string): Promise<string>; telegramSendMessage(credentialId: string, chatId: string, text: string): Promise<void> }>({',
        "  startToCloseTimeout: '10 seconds',",
        '});',
        '',
        ...buildJournalRuntimeCode(false).split('\n'),
        '',
        '// doc-start:onMessage:doc-trigger',
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
        "  __falangJournal({ kind: 'trigger', level: 'info', message: `telegram-trigger`, data: { payload: message } });",
        '  // icon-start:telegram-send-message:send1',
        '  await telegramSendMessage("cred-1", message.chat.id, `hi`);',
        '  // icon-end:telegram-send-message:send1',
        '}',
        '// doc-end:onMessage:doc-trigger',
      ].join('\n'),
    );
    expect(result.activities).toContain('export const telegramSendMessage = async () => {};');
    expect(result.activities).toContain('export const logActivity');
  });

  it('resolves call-function against a trigger-function document by id, same as a plain function', () => {
    const caller = functionNode('doc-caller', [
      { id: 'c1', name: 'call-function', data: { schemeId: 'doc-trigger', parameters: [], returnVariable: '' } },
    ]);
    const trigger = triggerFunctionNode('doc-trigger');

    const result = compileProject({
      documents: [
        functionDocument('doc-caller', 'run', caller),
        triggerFunctionDocument('doc-trigger', 'onMessage', trigger),
      ],
      integrations: [telegramIntegration],
    });

    expect(result.workflows).toContain('await onMessage();');
  });

  it('throws when a trigger-function is bound to a vendor/trigger not in the given integrations', () => {
    const trigger = triggerFunctionNode('doc-trigger');
    expect(() =>
      compileProject({ documents: [triggerFunctionDocument('doc-trigger', 'onMessage', trigger)], integrations: [] }),
    ).toThrow(/unknown trigger/);
  });
});
