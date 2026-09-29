import { describe, expect, it } from 'vitest';
import { registerQuestionScopeContributors } from './question-scope-contributor.js';
import type { IQuestionDescriptor, IWorkflowIntegration } from './types.js';

const baseQuestion: IQuestionDescriptor = {
  name: 'human-task',
  label: 'Human task',
  contextFields: [],
  questionFields: [],
  answerSignalName: 'humanTaskAnswer',
  askActivitySignature: 'createHumanTask(): Promise<{ messageId: string }>',
  askActivityCode: '',
  resolveActivitySignature: 'resolveHumanTask(messageId: string, selectedLabel: string): Promise<void>',
  resolveActivityCode: '',
};

const buildIntegration = (question: IQuestionDescriptor): IWorkflowIntegration => ({
  vendor: 'tasks',
  label: 'Tasks',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  questions: [question],
});

describe('registerQuestionScopeContributors', () => {
  it('registers nothing for a question with no answerScope', () => {
    const registered = new Map<string, (data: unknown) => unknown>();
    registerQuestionScopeContributors([buildIntegration(baseQuestion)], (name, fn) => registered.set(name, fn));
    expect(registered.size).toBe(0);
  });

  it('registers a contributor under "<name>-option" binding just the answer-scope variable when perOptionData is unset', () => {
    const question: IQuestionDescriptor = {
      ...baseQuestion,
      answerScope: { variableName: 'task', type: { type: 'struct', id: 'tasks/Task' } },
    };
    const registered = new Map<string, (data: unknown) => { name: string; type: unknown }[]>();
    registerQuestionScopeContributors([buildIntegration(question)], (name, fn) => registered.set(name, fn));

    expect([...registered.keys()]).toEqual(['human-task-option']);
    expect(registered.get('human-task-option')?.({ label: 'Approve', dataType: 'string' })).toEqual([
      { name: 'task', type: { type: 'struct', id: 'tasks/Task' } },
    ]);
  });

  it('with perOptionData, also binds "data" typed by the option\'s own scalar dataType', () => {
    const question: IQuestionDescriptor = {
      ...baseQuestion,
      answerScope: {
        variableName: 'task',
        type: { type: 'struct', id: 'tasks/Task' },
        perOptionData: true,
      },
    };
    const registered = new Map<string, (data: unknown) => { name: string; type: unknown }[]>();
    registerQuestionScopeContributors([buildIntegration(question)], (name, fn) => registered.set(name, fn));
    const contributor = registered.get('human-task-option');
    if (!contributor) throw new Error('expected a contributor to be registered');

    expect(contributor({ label: 'Reject', dataType: 'string' })).toEqual([
      { name: 'task', type: { type: 'struct', id: 'tasks/Task' } },
      { name: 'data', type: { type: 'string' } },
    ]);
    expect(contributor({ label: 'Approve', dataType: 'void' })).toEqual([
      { name: 'task', type: { type: 'struct', id: 'tasks/Task' } },
    ]);
  });

  it('with perOptionData, a number/boolean dataType resolves to the matching TVariableInfo', () => {
    const question: IQuestionDescriptor = {
      ...baseQuestion,
      answerScope: {
        variableName: 'task',
        type: { type: 'struct', id: 'tasks/Task' },
        perOptionData: true,
      },
    };
    const registered = new Map<string, (data: unknown) => { name: string; type: unknown }[]>();
    registerQuestionScopeContributors([buildIntegration(question)], (name, fn) => registered.set(name, fn));
    const contributor = registered.get('human-task-option');
    if (!contributor) throw new Error('expected a contributor to be registered');

    expect(contributor({ label: 'Amount', dataType: 'number' })).toEqual([
      { name: 'task', type: { type: 'struct', id: 'tasks/Task' } },
      { name: 'data', type: { type: 'number', numberType: { type: 'any' } } },
    ]);
    expect(contributor({ label: 'Confirm', dataType: 'boolean' })).toEqual([
      { name: 'task', type: { type: 'struct', id: 'tasks/Task' } },
      { name: 'data', type: { type: 'boolean' } },
    ]);
  });
});
