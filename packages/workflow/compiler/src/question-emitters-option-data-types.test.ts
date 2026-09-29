import type { INode } from '@falang/dto';
import type { IQuestionDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';
import { buildQuestionEmitters } from './question-emitters.js';

/**
 * Covers the two `question-emitters.ts` extensions added alongside `human-task`
 * (ADR 0040 (private) §1/§4), kept in a separate file from
 * `question-emitters.test.ts`/`telegram-question-timeout.test.ts` (which never set
 * `optionDataTypes`) so a regression here doesn't get lost among unrelated assertions.
 */

const noResolveFunctionName = (): string => {
  throw new Error('resolveFunctionName should not be called in these tests');
};

const buildDescriptor = (extra: Partial<IQuestionDescriptor> = {}): IQuestionDescriptor => ({
  name: 'human-task',
  label: 'Human task',
  contextFields: [],
  questionFields: [
    { name: 'title', label: 'Title', kind: 'template-string' },
    { name: 'payload', label: 'Payload', kind: 'expression' },
  ],
  answerSignalName: 'humanTaskAnswer',
  askActivitySignature:
    'humanTaskAsk(title: string, payload: unknown, options: string): Promise<{ messageId: string }>',
  askActivityCode: '',
  resolveActivitySignature: 'humanTaskResolve(messageId: string, answer: string): Promise<void>',
  resolveActivityCode: '',
  optionDataTypes: true,
  ...extra,
});

const buildIntegration = (question: IQuestionDescriptor): IWorkflowIntegration => ({
  vendor: 'tasks',
  label: 'Tasks',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  questions: [question],
});

const optionNode = (id: string, data: Record<string, unknown>, children: INode[] = []): INode => ({
  id,
  name: 'human-task-option',
  data,
  children,
});

describe('question-emitters: optionDataTypes sends full option data to the ask activity', () => {
  it('sends {label, dataType, prompt} per option instead of bare labels', () => {
    const emitters = buildQuestionEmitters([buildIntegration(buildDescriptor())]);
    const node: INode = {
      id: 'q1',
      name: 'human-task',
      data: { title: 'Approve?', payload: 'order', options: ['Approve', 'Reject'] },
      children: [
        optionNode('q1-approve', { label: 'Approve', dataType: 'void' }),
        optionNode('q1-reject', { label: 'Reject', dataType: 'string', prompt: 'Reason' }),
      ],
    };

    const result = compileStatements([node], noResolveFunctionName, {}, emitters);

    // `askActivitySignature`'s `options` param is a plain `string` (`optionDataTypes` descriptors),
    // so the compiled call must splice in a *string-literal* expression whose value is the option
    // JSON, not a bare array-literal expression — hence the outer `JSON.stringify` on top of the
    // JSON text itself.
    const optionsArg = JSON.stringify(
      JSON.stringify([
        { label: 'Approve', dataType: 'void' },
        { label: 'Reject', dataType: 'string', prompt: 'Reason' },
      ]),
    );
    expect(result).toContain(`humanTaskAsk(\`Approve?\`, order, ${optionsArg})`);
  });

  it('excludes the automatic fixed timeout option from the ask payload', () => {
    const descriptor = buildDescriptor({
      questionFields: [
        { name: 'title', label: 'Title', kind: 'template-string' },
        { name: 'payload', label: 'Payload', kind: 'expression' },
        { name: 'timeout', label: 'Timeout', kind: 'text' },
      ],
      timeoutField: 'timeout',
    });
    const emitters = buildQuestionEmitters([buildIntegration(descriptor)]);
    const node: INode = {
      id: 'q1',
      name: 'human-task',
      data: { title: 'Approve?', payload: 'order', timeout: '', options: ['Approve'] },
      children: [
        optionNode('q1-approve', { label: 'Approve', dataType: 'void' }),
        optionNode('q1-timeout', { label: 'timeout', dataType: 'void', fixed: true }),
      ],
    };

    const result = compileStatements([node], noResolveFunctionName, {}, emitters);

    expect(result).toContain(JSON.stringify(JSON.stringify([{ label: 'Approve', dataType: 'void' }])));
    expect(result).not.toContain('"fixed"');
  });

  it('a blank optional expression field compiles to a literal undefined argument, not an empty slot', () => {
    const emitters = buildQuestionEmitters([buildIntegration(buildDescriptor())]);
    const node: INode = {
      id: 'q1',
      name: 'human-task',
      data: { title: 'Approve?', payload: '', options: ['Approve'] },
      children: [optionNode('q1-approve', { label: 'Approve', dataType: 'void' })],
    };

    const result = compileStatements([node], noResolveFunctionName, {}, emitters);

    expect(result).toContain('humanTaskAsk(`Approve?`, undefined, ');
  });

  it('a descriptor without optionDataTypes still sends bare labels (telegram-question unaffected)', () => {
    const descriptor = buildDescriptor({ optionDataTypes: false });
    const emitters = buildQuestionEmitters([buildIntegration(descriptor)]);
    const node: INode = {
      id: 'q1',
      name: 'human-task',
      data: { title: 'Approve?', payload: 'order', options: ['Approve', 'Reject'] },
      children: [optionNode('q1-approve', { label: 'Approve' }), optionNode('q1-reject', { label: 'Reject' })],
    };

    const result = compileStatements([node], noResolveFunctionName, {}, emitters);

    expect(result).toContain('humanTaskAsk(`Approve?`, order, ["Approve","Reject"])');
  });
});
