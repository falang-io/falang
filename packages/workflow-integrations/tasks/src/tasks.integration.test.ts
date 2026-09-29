import { buildQuestionNodeConfig, getQuestionNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { HUMAN_TASK_ANSWER_SIGNAL_NAME, HUMAN_TASK_NAME, HUMAN_TASK_OPTION_NAME, TASKS_VENDOR } from './constants.js';
import { taskTypeInfo, tasksTaskType } from './task-types.js';
import { humanTaskQuestion, tasksIntegration } from './tasks.integration.js';

describe('tasksIntegration', () => {
  it('is a credential-free, trigger-free, action-free vendor with one question node', () => {
    expect(tasksIntegration.vendor).toBe(TASKS_VENDOR);
    expect(tasksIntegration.credentialFields).toEqual([]);
    expect(tasksIntegration.triggers).toEqual([]);
    expect(tasksIntegration.actions).toEqual([]);
    expect(tasksIntegration.questions).toEqual([humanTaskQuestion]);
    expect(tasksIntegration.types).toEqual([tasksTaskType]);
  });

  it('has no registerBackend — TasksService is the ingress, not a signal-relaying vendor backend', () => {
    expect(tasksIntegration.registerBackend).toBeUndefined();
  });

  it('sharedActivityCode imports Context and declares tasksInternalRequest', () => {
    expect(tasksIntegration.sharedActivityCode).toContain("import { Context } from '@temporalio/activity';");
    expect(tasksIntegration.sharedActivityCode).toContain('const tasksInternalRequest');
  });
});

describe('humanTaskQuestion', () => {
  it('has no contextFields — the recipient is always the project owner, resolved server-side', () => {
    expect(humanTaskQuestion.contextFields).toEqual([]);
  });

  it('declares the 5 header fields from the ADR table, in order', () => {
    expect(humanTaskQuestion.questionFields.map((field) => field.name)).toEqual([
      'title',
      'description',
      'payload',
      'attachments',
      'timeout',
    ]);
  });

  it('sets timeoutField to the timeout field and optionDataTypes/answerScope per ADR §1/§4', () => {
    expect(humanTaskQuestion.timeoutField).toBe('timeout');
    expect(humanTaskQuestion.optionDataTypes).toBe(true);
    expect(humanTaskQuestion.answerScope).toEqual({ variableName: 'task', type: taskTypeInfo(), perOptionData: true });
    expect(humanTaskQuestion.answerSignalName).toBe(HUMAN_TASK_ANSWER_SIGNAL_NAME);
  });

  it('declares ask/resolve/close activity signatures matching the internal API contract', () => {
    expect(humanTaskQuestion.askActivitySignature).toContain('humanTaskAsk(title: string, description: string');
    expect(humanTaskQuestion.resolveActivitySignature).toBe(
      'humanTaskResolve(messageId: string, answer: string): Promise<void>',
    );
    expect(humanTaskQuestion.closeActivitySignature).toBe(
      'humanTaskClose(messageId: string, reason: string): Promise<void>',
    );
  });

  it('runs as a regular (task-queue-routed) activity with a 30s timeout', () => {
    expect(humanTaskQuestion.activityOptions).toEqual({ kind: 'regular', startToCloseTimeout: '30 seconds' });
  });

  it('produces human-task/human-task-option node configs through the shared question builder', () => {
    const configs = getQuestionNodeConfigs([humanTaskQuestion]);
    expect(configs.map((config) => config.name)).toEqual([HUMAN_TASK_NAME, HUMAN_TASK_OPTION_NAME]);
  });

  it('every default option carries a void dataType, plus a fixed timeout option (timeoutField is set)', () => {
    const [header] = buildQuestionNodeConfig(humanTaskQuestion);
    const node = header.factory?.();
    expect(node?.children?.map((child) => child.data)).toEqual([
      { label: 'Вариант 1', dataType: 'void' },
      { label: 'Вариант 2', dataType: 'void' },
      { label: 'timeout', dataType: 'void', fixed: true },
    ]);
  });

  it('the option schema accepts a typed, non-void option with a prompt (e.g. a Reject reason)', () => {
    const [, option] = buildQuestionNodeConfig(humanTaskQuestion);
    expect(() =>
      option.data?.type.parse({ label: 'Reject', dataType: 'string', prompt: 'Reason' }),
    ).not.toThrow();
    expect(() => option.data?.type.parse({ label: 'Bad', dataType: 'not-a-type' })).toThrow();
  });
});
