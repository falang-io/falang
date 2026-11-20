import { describe, expect, it } from 'vitest';
import {
  buildButtonWaitQuestion,
  BUTTON_WAIT_BRANCHES,
  BUTTON_WAIT_DEFAULT_ANSWER_VARIABLE,
  BUTTON_WAIT_PRESSED_LABEL,
} from './button-wait.js';
import {
  buildButtonWaitRegistryActivityCode,
  decodeButtonWaitCallback,
  encodeButtonWaitCallback,
  MESSAGE_BUTTON_WAIT_PREFIX,
} from './button-wait-activity.js';
import { buildQuestionNodeConfig } from './build-question-node-config.js';
import { registerQuestionScopeContributors, type TQuestionScopeContributor } from './question-scope-contributor.js';
import type { IWorkflowIntegration } from './types.js';

const descriptor = buildButtonWaitQuestion({
  name: 'telegram-ask-buttons',
  label: 'Ask',
  answerSignalName: 'telegramButtonAnswer',
  answerType: { type: 'struct', id: 'telegram/ButtonAnswer' },
  contextFields: [],
  textLabel: 'Text',
  buttonsLabel: 'Buttons',
  timeoutLabel: 'Timeout',
  answerVariableLabel: 'Answer variable',
  askActivitySignature: 'ask(): Promise<{ messageId: string; waitId: string }>',
  askActivityCode: '',
  resolveActivitySignature: 'resolve(): Promise<void>',
  resolveActivityCode: '',
  closeActivitySignature: 'close(): Promise<void>',
  closeActivityCode: '',
});

const integration = {
  vendor: 'telegram',
  questions: [descriptor],
} as unknown as IWorkflowIntegration;

describe('button wait model', () => {
  it('seeds pressed/timeout branches and a required answer variable named answer', () => {
    const [header] = buildQuestionNodeConfig(descriptor);
    const node = header.factory?.();
    expect(node?.data).toMatchObject({ options: [], timeout: '10m', answerVariable: 'answer' });
    expect(node?.children?.map((child) => child.data)).toEqual(BUTTON_WAIT_BRANCHES);
    const answerField = descriptor.questionFields.find((field) => field.name === 'answerVariable');
    expect(answerField).toMatchObject({ kind: 'new-variable', defaultValue: 'answer', allowEmpty: false });
  });

  it('uses the parent header name in live scope and the option fallback in a compiled tree', () => {
    const contributors = new Map<string, TQuestionScopeContributor>();
    registerQuestionScopeContributors([integration], (name, contributor) => contributors.set(name, contributor));
    const contribute = contributors.get('telegram-ask-buttons-option');
    const expected = [{ name: 'choice', type: { type: 'struct', id: 'telegram/ButtonAnswer', constant: true } }];
    expect(
      contribute?.(
        { label: BUTTON_WAIT_PRESSED_LABEL, fixed: true },
        { parent: { data: { answerVariable: 'choice' } } },
      ),
    ).toEqual(expected);
    expect(contribute?.({ label: BUTTON_WAIT_PRESSED_LABEL, variable: 'choice' })).toEqual(expected);
    expect(contribute?.({ label: 'timeout', fixed: true })).toEqual([]);
    expect(contribute?.({ label: BUTTON_WAIT_PRESSED_LABEL })).toEqual([
      {
        name: BUTTON_WAIT_DEFAULT_ANSWER_VARIABLE,
        type: { type: 'struct', id: 'telegram/ButtonAnswer', constant: true },
      },
    ]);
  });
});

describe('button wait callback', () => {
  it('round-trips an opaque wait id and index', () => {
    const encoded = encodeButtonWaitCallback('run-1:42', 3);
    expect(encoded).toBe(`${MESSAGE_BUTTON_WAIT_PREFIX}run-1:42:3`);
    expect(decodeButtonWaitCallback(encoded)).toEqual({ waitId: 'run-1:42', buttonIndex: 3 });
  });

  it.each(['falang-cmd:/help', 'falang-wait:missing-index', 'falang-wait:run:-1', 'falang-wait:run:x', '', null])(
    'rejects %s',
    (value) => {
      expect(decodeButtonWaitCallback(value)).toBeUndefined();
    },
  );

  it('generates registry calls scoped to the current project and run', () => {
    const code = buildButtonWaitRegistryActivityCode('telegram', 'telegram');
    expect(code).toContain('/button-waits');
    expect(code).toContain('workflowId: execution.workflowId');
    expect(code).toContain('runId: execution.runId');
    expect(code).toContain('vendor: "telegram"');
  });
});
