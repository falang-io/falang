import type { INode } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileStatements } from './node-emitters.js';
import { buildQuestionEmitters } from './question-emitters.js';

/** None of these tests exercise `call-function`, so this should never actually be invoked. */
const noResolveFunctionName = (): string => {
  throw new Error('resolveFunctionName should not be called in these tests');
};

const telegramIntegration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  questions: [
    {
      name: 'telegram-question',
      label: 'Ask question',
      contextFields: [
        { name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' },
        { name: 'chatId', label: 'Chat ID', kind: 'expression' },
      ],
      questionFields: [{ name: 'question', label: 'Question', kind: 'template-string' }],
      answerSignalName: 'telegramQuestionAnswer',
      askActivitySignature:
        'telegramAskQuestion(credentialId: string, chatId: number, question: string, options: readonly string[]): Promise<{ messageId: string }>',
      askActivityCode: '',
      resolveActivitySignature:
        'telegramResolveQuestionAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>',
      resolveActivityCode: '',
    },
  ],
};

const questionNode = (
  id: string,
  options: readonly { readonly label: string; readonly children?: INode[] }[],
): INode => ({
  id,
  name: 'telegram-question',
  data: {
    credentialId: 'cred-1',
    chatId: 'message.chat.id',
    question: 'Pick one',
    options: options.map((o) => o.label),
  },
  children: options.map((option, index) => ({
    id: `${id}-option-${index}`,
    name: 'telegram-question-option',
    data: { label: option.label },
    children: option.children ?? [],
  })),
});

describe('buildQuestionEmitters', () => {
  it('compiles ask -> signal-wait -> resolve -> switch, correlated by the sent message id', () => {
    const questionEmitters = buildQuestionEmitters([telegramIntegration]);
    const node = questionNode('q1', [
      { label: 'Yes', children: [{ id: 'log-yes', name: 'log', data: 'picked yes' }] },
      { label: 'No', children: [{ id: 'log-no', name: 'log', data: 'picked no' }] },
    ]);

    const result = compileStatements([node], noResolveFunctionName, {}, questionEmitters);

    expect(result).toBe(
      [
        '// icon-start:telegram-question:q1',
        'const q_q1MessageId = (await telegramAskQuestion("cred-1", message.chat.id, `Pick one`, ["Yes","No"])).messageId;',
        'let q_q1HasAnswer = false;',
        'let q_q1Answer!: string;',
        "setHandler(defineSignal<[{ messageId: string; value: string }]>('telegramQuestionAnswer'), (payload) => {",
        '  if (payload.messageId === q_q1MessageId) {',
        '    q_q1Answer = payload.value;',
        '    q_q1HasAnswer = true;',
        '  } else {',
        "    __falangJournal({ kind: 'error', level: 'warn', message: 'Ignored input: it does not match the pending question', data: { payload } });",
        '  }',
        '});',
        'await condition(() => q_q1HasAnswer);',
        "__falangJournal({ kind: 'user-input', level: 'info', message: `Answer: ${q_q1Answer}`, data: { value: q_q1Answer } });",
        'await telegramResolveQuestionAnswer("cred-1", message.chat.id, q_q1MessageId, q_q1Answer);',
        'switch (q_q1Answer) {',
        '  case "Yes": {',
        '    // icon-start:log:log-yes',
        "    __falangJournal({ kind: 'log', level: 'info', message: `picked yes` });",
        '    // icon-end:log:log-yes',
        '    break;',
        '  }',
        '  case "No": {',
        '    // icon-start:log:log-no',
        "    __falangJournal({ kind: 'log', level: 'info', message: `picked no` });",
        '    // icon-end:log:log-no',
        '    break;',
        '  }',
        '}',
        '// icon-end:telegram-question:q1',
      ].join('\n'),
    );
  });

  it('sanitizes node ids containing "-" into valid JS identifiers, unique per node instance', () => {
    const questionEmitters = buildQuestionEmitters([telegramIntegration]);
    const node = questionNode('abc-123-xyz', [{ label: 'Only' }]);

    const result = compileStatements([node], noResolveFunctionName, {}, questionEmitters);

    expect(result).toContain('q_abc_123_xyzMessageId');
    expect(result).toContain('q_abc_123_xyzAnswer');
  });

  it('produces a bare `break;` for an option with no branch statements', () => {
    const questionEmitters = buildQuestionEmitters([telegramIntegration]);
    const node = questionNode('q2', [{ label: 'Empty' }]);

    const result = compileStatements([node], noResolveFunctionName, {}, questionEmitters);

    expect(result).toContain('case "Empty": {\n    break;\n  }');
  });

  it('only registers emitters for descriptors actually present in the given integrations', () => {
    const emitters = buildQuestionEmitters([{ ...telegramIntegration, questions: [] }]);
    expect(Object.keys(emitters)).toEqual([]);
  });
});
