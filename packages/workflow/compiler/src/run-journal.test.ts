import type { INode } from '@falang/dto';
import type { IQuestionDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { collectActivityJournal, parseActivityParamNames } from './activity-journal.js';
import { compileActivities } from './compile-activities.js';
import { compileProject } from './compile-project.js';
import { compileTriggerFunction } from './compile-trigger-function.js';
import {
  buildJournalRuntimeCode,
  JOURNAL_INTERCEPTORS_MODULE,
  JOURNAL_NODE_HEADER,
  needsJournalInterceptors,
} from './journal-runtime.js';
import { compileStatements } from './node-emitters.js';
import { buildQuestionEmitters } from './question-emitters.js';

const noResolve = (): string => {
  throw new Error('unexpected');
};

const question = (extra: Partial<IQuestionDescriptor> = {}): IQuestionDescriptor => ({
  name: 'q-kind',
  label: 'Q',
  contextFields: [{ name: 'chatId', label: 'Chat', kind: 'expression' }],
  questionFields: [
    { name: 'question', label: 'Question', kind: 'template-string' },
    { name: 'timeout', label: 'Timeout', kind: 'text' },
  ],
  answerSignalName: 'qAnswer',
  askActivitySignature:
    'qAsk(chatId: number, question: string, options: readonly string[]): Promise<{ messageId: string }>',
  askActivityCode: 'export const qAsk = async () => ({ messageId: "1" });',
  resolveActivitySignature: 'qResolve(chatId: number, messageId: string, label: string): Promise<void>',
  resolveActivityCode: 'export const qResolve = async () => {};',
  timeoutField: 'timeout',
  journal: { kind: 'message-out', args: ['chatId', 'question', 'options'] },
  ...extra,
});

const integration = (q: IQuestionDescriptor): IWorkflowIntegration => ({
  vendor: 'v',
  label: 'V',
  notes: 'n',
  credentialFields: [],
  triggers: [],
  actions: [
    {
      name: 'v-act',
      label: 'A',
      fields: [],
      emit: () => 'await vAct();',
      activityCode: 'export const vAct = async () => {};',
      activitySignature:
        'vAct(model: string, file: { id: string; name: string }, items: readonly { a: string; b: number }[] | undefined, cb: (x: number) => void): Promise<void>',
      journal: { kind: 'ai', args: ['model', 'file'], result: false },
    },
  ],
  questions: [q],
});

const questionNode = (timeout: string): INode => ({
  id: 'q1',
  name: 'q-kind',
  data: { chatId: '1', question: 'Pick', timeout, options: ['Yes'] },
  children: [
    { id: 'q1-yes', name: 'q-kind-option', data: { label: 'Yes' }, children: [] },
    ...(timeout ? [{ id: 'q1-t', name: 'q-kind-option', data: { label: 'timeout', fixed: true }, children: [] }] : []),
  ],
});

const body = (vendor: string, triggerName: string): INode => ({
  id: 't',
  name: 'trigger-function',
  children: [
    { id: 'h', name: 'function-header', data: '' },
    {
      id: 'b',
      name: 'trigger-function-body',
      data: { vendor, triggerName, credentialId: '' },
      children: [],
    },
    { id: 'f', name: 'function-footer', data: '' },
  ],
});
const trigger = (delivery: 'signal' | 'start') => ({
  name: 'tr',
  label: 'T',
  notes: 'n',
  scopeType: { type: 'any' as const },
  scopeVariableName: 'msg',
  signalName: 'sig',
  webhookPath: '/x',
  delivery,
  journalMessage: '${msg.text}',
});

describe('run journal emission (ADR 0059)', () => {
  it('journals the accepted answer, the timeout and an ignored press', () => {
    const emitters = buildQuestionEmitters([integration(question())]);
    const code = compileStatements([questionNode('5m')], noResolve, {}, emitters);
    expect(code).toContain("kind: 'error', level: 'warn', message: 'Ignored input");
    expect(code).toContain("__falangJournal({ kind: 'user-input', level: 'info', message: `Answer: ${q_q1Answer}`");
    expect(code).toContain(
      "kind: 'user-input', level: 'warn', message: 'No answer: timed out', data: { timeout: true }",
    );
    // accepted entry sits inside the `if (Answered)` branch, the timeout one in its else
    expect(code.indexOf("level: 'info', message: `Answer")).toBeLessThan(code.indexOf('No answer'));
  });

  it('journals resolvedBy/resolvedAt for a descriptor with answerScope', () => {
    const emitters = buildQuestionEmitters([
      integration(question({ answerScope: { variableName: 'task', type: { type: 'any' } } })),
    ]);
    const code = compileStatements([questionNode('')], noResolve, {}, emitters);
    expect(code).toContain('resolvedBy: q_q1Payload?.resolvedBy, resolvedAt: q_q1Payload?.resolvedAt');
  });

  it('journals the trigger payload for both deliveries, using journalMessage when set', () => {
    const withTriggers = (delivery: 'signal' | 'start'): IWorkflowIntegration => ({
      ...integration(question()),
      triggers: [trigger(delivery)],
    });
    for (const delivery of ['signal', 'start'] as const) {
      const code = compileTriggerFunction(body('v', 'tr'), 'onTr', [withTriggers(delivery)]);
      expect(code).toContain(
        "__falangJournal({ kind: 'trigger', level: 'info', message: `${msg.text}`, data: { payload: msg } });",
      );
    }
  });

  it('journals the failure before throwing the position wrapper', () => {
    const result = compileProject({
      documents: [
        {
          id: 'd',
          type: 'function',
          name: 'f',
          root: {
            id: 'd',
            name: 'function',
            children: [
              { id: 'h', name: 'function-header', data: '' },
              { id: 'b', name: 'function-body', data: { parameters: [] }, children: [] },
              { id: 'ft', name: 'function-footer', data: '' },
            ],
          },
        },
      ],
      trackPosition: true,
    });
    expect(result.workflows).toContain("kind: 'error',");
    expect(result.workflows).toContain('position: __falangSnapshot()');
    expect(result.workflows).toContain('export const __falangPositionStack');
    expect(needsJournalInterceptors(result.workflows)).toBe(true);
    expect(needsJournalInterceptors(compileProject({ documents: [] }).workflows)).toBe(false);
  });

  it('defaults documentId/nodeId from the position stack only when tracking is on', () => {
    expect(buildJournalRuntimeCode(true)).toContain('__falangPositionStack[__falangPositionStack.length - 1]');
    expect(buildJournalRuntimeCode(false)).not.toContain('__falangPositionStack');
    expect(buildJournalRuntimeCode(false)).toContain('catch');
  });

  it('generates an interceptor module adding the falang-node header to both schedule calls', () => {
    expect(JOURNAL_NODE_HEADER).toBe('falang-node');
    expect(JOURNAL_INTERCEPTORS_MODULE).toContain("'falang-node': payload");
    expect(JOURNAL_INTERCEPTORS_MODULE).toContain('scheduleActivity');
    expect(JOURNAL_INTERCEPTORS_MODULE).toContain('scheduleLocalActivity');
    expect(JOURNAL_INTERCEPTORS_MODULE).toContain('defaultPayloadConverter');
  });
});

describe('activity journal metadata', () => {
  it('parses parameter names across nested object/array/generic/arrow types', () => {
    expect(
      parseActivityParamNames(
        'vAct(model: string, file: { id: string; name: string }, items?: readonly { a: string; b: number }[] | undefined, cb: (x: number) => void): Promise<void>',
      ),
    ).toEqual(['model', 'file', 'items', 'cb']);
    expect(parseActivityParamNames('noArgs(): Promise<void>')).toEqual([]);
  });

  it('collects specs for actions, question ask activities and choices; rejects unknown args', () => {
    const { journal, params } = collectActivityJournal([integration(question())]);
    expect(journal).toEqual({
      vAct: { kind: 'ai', args: ['model', 'file'], result: false },
      qAsk: { kind: 'message-out', args: ['chatId', 'question', 'options'] },
    });
    expect(params.qAsk).toEqual(['chatId', 'question', 'options']);
    expect(() => collectActivityJournal([integration(question({ journal: { kind: 'ai', args: ['nope'] } }))])).toThrow(
      /journal arg "nope"/,
    );
  });

  it('exports both maps from activities.ts next to the vendor map', () => {
    const metadata = collectActivityJournal([integration(question())]);
    const code = compileActivities([], { activityJournal: metadata });
    expect(code).toContain('export const __falangActivityJournal');
    expect(code).toContain("'qAsk':{'kind':'message-out'");
    expect(code).toContain("export const __falangActivityParams: Record<string, string[]> = {'vAct':['model'");
  });
});
