import type { INode, IProjectDocument } from '@falang/dto';
import type { IQuestionDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';
import { compileStatements } from './node-emitters.js';
import { buildQuestionEmitters } from './question-emitters.js';

/** None of these tests exercise `call-function`, so this should never actually be invoked — same helper `question-emitters.test.ts` uses. */
const noResolveFunctionName = (): string => {
  throw new Error('resolveFunctionName should not be called in these tests');
};

const CONTEXT_FIELDS: IQuestionDescriptor['contextFields'] = [
  { name: 'credentialId', label: 'Bot', kind: 'credential-ref', vendor: 'telegram' },
  { name: 'chatId', label: 'Chat ID', kind: 'expression' },
];
const ASK_ACTIVITY_SIGNATURE =
  'telegramAskQuestion(credentialId: string, chatId: number, question: string, options: readonly string[]): Promise<{ messageId: string }>';
const RESOLVE_ACTIVITY_SIGNATURE =
  'telegramResolveQuestionAnswer(credentialId: string, chatId: number, messageId: string, selectedLabel: string): Promise<void>';
const CLOSE_ACTIVITY_SIGNATURE =
  'telegramCloseQuestion(credentialId: string, chatId: number, messageId: string, reason: string): Promise<void>';

/**
 * The `telegram-question` descriptor exactly as it was before ADR 0040 (private)
 * §4 — no `timeout` field, no `timeoutField`/`closeActivitySignature`. Defined locally (not imported
 * from `@falang/workflow-integrations-telegram`) for the same "compiler stays vendor-agnostic,
 * fixtures build their own `IWorkflowIntegration`" reason `question-emitters.test.ts` already follows.
 */
const buildBareQuestion = (): IQuestionDescriptor => ({
  name: 'telegram-question',
  label: 'Ask question',
  contextFields: CONTEXT_FIELDS,
  questionFields: [{ name: 'question', label: 'Question', kind: 'template-string' }],
  answerSignalName: 'telegramQuestionAnswer',
  askActivitySignature: ASK_ACTIVITY_SIGNATURE,
  askActivityCode: 'export const telegramAskQuestion = async () => ({ messageId: "1" });',
  resolveActivitySignature: RESOLVE_ACTIVITY_SIGNATURE,
  resolveActivityCode: 'export const telegramResolveQuestionAnswer = async () => {};',
});

/** The same descriptor, extended per ADR 0040 (private) §4's "Decisions" item 4 (added in the same pass as `human-task`). */
const buildQuestionWithTimeout = (): IQuestionDescriptor => ({
  ...buildBareQuestion(),
  questionFields: [
    { name: 'question', label: 'Question', kind: 'template-string' },
    { name: 'timeout', label: 'Timeout', kind: 'text' },
  ],
  timeoutField: 'timeout',
  closeActivitySignature: CLOSE_ACTIVITY_SIGNATURE,
  closeActivityCode: 'export const telegramCloseQuestion = async () => {};',
});

const buildIntegration = (question: IQuestionDescriptor): IWorkflowIntegration => ({
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  questions: [question],
});

/** `Yes`/`No` plus, when `withFixedTimeoutOption`, the automatic `timeout` option `buildQuestionNodeConfig` would add for a descriptor with `timeoutField` set. */
const questionNode = (id: string, timeoutValue: string, withFixedTimeoutOption: boolean): INode => ({
  id,
  name: 'telegram-question',
  data: {
    credentialId: 'cred-1',
    chatId: 'message.chat.id',
    question: 'Pick one',
    timeout: timeoutValue,
    options: ['Yes', 'No'],
  },
  children: [
    { id: `${id}-yes`, name: 'telegram-question-option', data: { label: 'Yes' }, children: [] },
    { id: `${id}-no`, name: 'telegram-question-option', data: { label: 'No' }, children: [] },
    ...(withFixedTimeoutOption
      ? [
          {
            id: `${id}-timeout`,
            name: 'telegram-question-option',
            data: { label: 'timeout', fixed: true },
            children: [],
          },
        ]
      : []),
  ],
});

const triggerFunctionNode = (id: string, bodyChildren: INode[]): INode => ({
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

const TELEGRAM_TRIGGER: IWorkflowIntegration['triggers'][number] = {
  name: 'telegram-trigger',
  label: 'On message',
  notes: 'Fires for every incoming message.',
  scopeType: { type: 'any' },
  scopeVariableName: 'message',
  signalName: 'telegramMessage',
  webhookPath: '/webhooks/telegram/:credentialId/:env',
};

describe('telegram-question with timeoutField (ADR 0040 (private) §4)', () => {
  it('a descriptor with neither timeoutField/answerScope/closeActivitySignature compiles byte-identically to before these extensions existed', () => {
    const emitters = buildQuestionEmitters([buildIntegration(buildBareQuestion())]);
    const node = questionNode('q1', '', false);

    const result = compileStatements([node], noResolveFunctionName, {}, emitters);

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
        '  }',
        '});',
        'await condition(() => q_q1HasAnswer);',
        'await telegramResolveQuestionAnswer("cred-1", message.chat.id, q_q1MessageId, q_q1Answer);',
        'switch (q_q1Answer) {',
        '  case "Yes": {',
        '    break;',
        '  }',
        '  case "No": {',
        '    break;',
        '  }',
        '}',
        '// icon-end:telegram-question:q1',
      ].join('\n'),
    );
  });

  it("timeoutField set but the node's own value left empty still waits forever (no Answered variable, plain switch discriminant), but still wraps the wait for cancellation-safety since closeActivitySignature is declared", () => {
    const emitters = buildQuestionEmitters([buildIntegration(buildQuestionWithTimeout())]);
    const result = compileStatements([questionNode('q1', '', true)], noResolveFunctionName, {}, emitters);

    expect(result).not.toContain('q_q1Answered');
    expect(result).toContain('await condition(() => q_q1HasAnswer);');
    expect(result).toContain(
      'await telegramResolveQuestionAnswer("cred-1", message.chat.id, q_q1MessageId, q_q1Answer);',
    );
    expect(result).toContain('switch (q_q1Answer) {');
    expect(result).toContain('try {');
    expect(result).toContain('if (isCancellation(e)) {');
    expect(result).toContain(
      'await CancellationScope.nonCancellable(() => telegramCloseQuestion("cred-1", message.chat.id, q_q1MessageId, \'cancelled\'));',
    );
  });

  it('a non-empty timeout value waits with a millisecond timeout and takes the fixed timeout branch on expiry', () => {
    const emitters = buildQuestionEmitters([buildIntegration(buildQuestionWithTimeout())]);
    const result = compileStatements([questionNode('q1', '10m', true)], noResolveFunctionName, {}, emitters);

    expect(result).toContain('let q_q1Answered = false;');
    expect(result).toContain('q_q1Answered = await condition(() => q_q1HasAnswer, 600000);');
    // The declaration must be OUTSIDE the `try { … }` the `closeFnName`-guarded wait is wrapped in —
    // a `const`/`let` declared inside would go out of scope before `if (q_q1Answered)`/`switch` below
    // read it, which would fail a real `typeCheckProject` even though these string-`toContain`
    // assertions alone can't detect it (see `compile-project-question-timeout.test.ts`, which does a
    // real typecheck of the compiled output for exactly this reason).
    expect(result.indexOf('let q_q1Answered = false;')).toBeLessThan(result.indexOf('try {'));
    expect(result).toContain('if (!q_q1Answered) {');
    expect(result).toContain('await telegramCloseQuestion("cred-1", message.chat.id, q_q1MessageId, \'expired\');');
    expect(result).toContain('try {');
    expect(result).toContain('if (isCancellation(e)) {');
    expect(result).toContain(
      'await CancellationScope.nonCancellable(() => telegramCloseQuestion("cred-1", message.chat.id, q_q1MessageId, \'cancelled\'));',
    );
    expect(result).toContain('if (q_q1Answered) {');
    expect(result).toContain(
      'await telegramResolveQuestionAnswer("cred-1", message.chat.id, q_q1MessageId, q_q1Answer);',
    );
    expect(result).toContain("switch (q_q1Answered ? q_q1Answer : '__timeout__') {");
    expect(result).toContain("case '__timeout__': {");
  });

  it('compileProject proxies the close activity alongside ask/resolve and imports CancellationScope/isCancellation', () => {
    const integration: IWorkflowIntegration = {
      ...buildIntegration(buildQuestionWithTimeout()),
      triggers: [TELEGRAM_TRIGGER],
      sharedActivityCode: 'const resolveTelegramBotToken = async () => "token";',
    };
    const document: IProjectDocument = {
      id: 'doc-trigger',
      type: 'trigger-function',
      name: 'onMessage',
      root: triggerFunctionNode('doc-trigger', [questionNode('q1', '10m', true)]),
    };

    const result = compileProject({ documents: [document], integrations: [integration] });

    expect(result.workflows).toContain('CancellationScope');
    expect(result.workflows).toContain('isCancellation');
    expect(result.activities).toContain('export const telegramCloseQuestion');
    const closeIndex = result.activities.indexOf('export const telegramCloseQuestion');
    const askIndex = result.activities.indexOf('export const telegramAskQuestion');
    expect(askIndex).toBeGreaterThanOrEqual(0);
    expect(closeIndex).toBeGreaterThan(askIndex);
  });

  it('compileProject imports neither CancellationScope nor isCancellation when no question declares closeActivitySignature', () => {
    const integration: IWorkflowIntegration = {
      ...buildIntegration(buildBareQuestion()),
      triggers: [TELEGRAM_TRIGGER],
      sharedActivityCode: 'const resolveTelegramBotToken = async () => "token";',
    };
    const document: IProjectDocument = {
      id: 'doc-trigger',
      type: 'trigger-function',
      name: 'onMessage',
      root: triggerFunctionNode('doc-trigger', [questionNode('q1', '', false)]),
    };

    const result = compileProject({ documents: [document], integrations: [integration] });

    expect(result.workflows).not.toContain('CancellationScope');
    expect(result.workflows).not.toContain('isCancellation');
  });
});
