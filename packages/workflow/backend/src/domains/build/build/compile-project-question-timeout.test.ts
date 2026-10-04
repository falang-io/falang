import type { INode, IProjectDocument } from '@falang/dto';
import type { IQuestionDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  TELEGRAM_QUESTION_NAME,
  TELEGRAM_TRIGGER_NAME,
  TELEGRAM_VENDOR,
} from '@falang/workflow-integrations-telegram';
import { describe, expect, it, vi } from 'vitest';
import { REGISTERED_INTEGRATIONS } from '../../integrations/registered-integrations.js';
import { buildHumanTaskNode } from '../../../test-utils/workflow-e2e-fixtures-tasks.js';
import { compileProjectDocuments } from './compile-project-documents.js';

// Same reason `compile-project-documents.test.ts` sets this — a real `ts.Program` cold start can
// exceed vitest's default 5s timeout alongside the rest of the monorepo's suite.
vi.setConfig({ testTimeout: 20_000 });

const triggerFunctionNode = (id: string, bodyChildren: readonly INode[]): INode => ({
  id,
  name: 'trigger-function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    {
      id: `${id}-body`,
      name: 'trigger-function-body',
      data: { vendor: TELEGRAM_VENDOR, triggerName: TELEGRAM_TRIGGER_NAME, credentialId: 'cred-1' },
      children: [...bodyChildren],
    },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

/** Mirrors `@falang/workflow-integrations-telegram`'s real `telegram-question` node shape (ADR 0040 (private) §4's `timeout` field). */
const telegramQuestionNode = (id: string, timeout: string, withTimeoutOption: boolean): INode => ({
  id,
  name: TELEGRAM_QUESTION_NAME,
  data: { credentialId: 'cred-1', chatId: 'message.chat.id', question: 'Pick one', timeout, options: ['Yes', 'No'] },
  children: [
    { id: `${id}-yes`, name: `${TELEGRAM_QUESTION_NAME}-option`, data: { label: 'Yes' }, children: [] },
    { id: `${id}-no`, name: `${TELEGRAM_QUESTION_NAME}-option`, data: { label: 'No' }, children: [] },
    ...(withTimeoutOption
      ? [
          {
            id: `${id}-timeout`,
            name: `${TELEGRAM_QUESTION_NAME}-option`,
            data: { label: 'timeout', fixed: true },
            children: [],
          },
        ]
      : []),
  ],
});

const functionNode = (id: string, bodyChildren: INode[]): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: bodyChildren },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

// Real ts.Program type-check / app boot (up to ~12s alone); the package has no own vitest config, so the default 5s/10s would flake under a full parallel run.
vi.setConfig({ testTimeout: 45_000 });

describe('compileProjectDocuments — telegram-question with a real timeout (ADR 0040 (private) §4)', () => {
  it('a real telegram-question with timeout: "10m" and a fixed timeout branch compiles and type-checks', () => {
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'trigger-function',
      name: 'onMessage',
      root: triggerFunctionNode('doc-1', [telegramQuestionNode('q1', '10m', true)]),
    };

    // Throws (BadRequestException, structural or type errors) on any failure — a bare successful
    // return already proves both `compileProject` and the real `ts.Program` typecheck accept it.
    // This is exactly the class of bug the coordinator's string-`toContain` compiler-level tests
    // couldn't catch: a `const q_q1Answered = …` declared inside a `try { … }` going out of scope
    // before the `if (q_q1Answered)`/`switch` that read it right after.
    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('switch (q_q1Answered ? q_q1Answer : ');
  });

  it('regression: the same telegram-question with no timeout (empty value) still compiles and type-checks', () => {
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'trigger-function',
      name: 'onMessage',
      root: triggerFunctionNode('doc-1', [telegramQuestionNode('q1', '', true)]),
    };

    const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
    expect(result.workflows).toContain('await condition(() => q_q1HasAnswer);');
  });

  it('a synthetic question with answerScope + perOptionData compiles and type-checks (a non-void option\'s `data` prelude must null-assert the possibly-undefined payload)', () => {
    const syntheticQuestion: IQuestionDescriptor = {
      name: 'synthetic-question',
      label: 'Synthetic question',
      contextFields: [],
      questionFields: [],
      answerSignalName: 'syntheticAnswer',
      askActivitySignature: 'syntheticAsk(options: readonly string[]): Promise<{ messageId: string }>',
      askActivityCode:
        'export const syntheticAsk = async (options: readonly string[]): Promise<{ messageId: string }> => ({ messageId: "1" });',
      resolveActivitySignature: 'syntheticResolve(messageId: string, selectedLabel: string): Promise<void>',
      resolveActivityCode:
        'export const syntheticResolve = async (messageId: string, selectedLabel: string): Promise<void> => {};',
      answerScope: {
        variableName: 'task',
        // `any` deliberately — `variableInfoToTsType` (no `structNames` passed by `question-emitters.ts`)
        // already renders every `struct` type as `any` too (see `render-variable-type.ts`'s own doc),
        // so a real `human-task`'s `tasks/Task` type-checks the exact same way; using `any` directly
        // here keeps this fixture free of an unrelated "no such interface" failure.
        type: { type: 'any' },
        perOptionData: true,
      },
    };
    const syntheticIntegration: IWorkflowIntegration = {
      vendor: 'synthetic',
      label: 'Synthetic',
      notes: 'Test-only vendor, registered on top of REGISTERED_INTEGRATIONS for this test alone.',
      credentialFields: [],
      triggers: [],
      actions: [],
      questions: [syntheticQuestion],
    };
    const questionNode: INode = {
      id: 'q1',
      name: 'synthetic-question',
      data: { options: ['Reject', 'Approve'] },
      children: [
        {
          id: 'q1-reject',
          name: 'synthetic-question-option',
          data: { label: 'Reject', dataType: 'string' },
          // References the per-branch `data` prelude AND the always-bound `task` — either one
          // failing to typecheck (the actual bug: `qPayload.data` without `!`/`?.`) fails this test.
          children: [{ id: 'log-reject', name: 'log', data: 'Reason: ${data}, resolved by ${task.resolvedBy}' }],
        },
        {
          id: 'q1-approve',
          name: 'synthetic-question-option',
          data: { label: 'Approve', dataType: 'void' },
          children: [{ id: 'log-approve', name: 'log', data: 'approved' }],
        },
      ],
    };
    const document: IProjectDocument = {
      id: 'doc-1',
      type: 'function',
      name: 'run',
      root: functionNode('doc-1', [questionNode]),
    };

    const result = compileProjectDocuments([document], [...REGISTERED_INTEGRATIONS, syntheticIntegration]);
    expect(result.workflows).toContain('const data = q_q1Payload!.data as string;');
  });

  it(
    'a real human-task (ADR 0040 (private) §1, `optionDataTypes`) with two options and return-ending ' +
      'branches compiles and type-checks (the bug this file was added for: `askActivitySignature`\'s ' +
      "`options: string` param needs a JSON *string literal*, not a bare array-literal expression)",
    () => {
      const humanTaskNode = buildHumanTaskNode(
        'q1',
        { title: 'Approve this order?', description: 'Please check the amount.' },
        [
          {
            label: 'Approve',
            dataType: 'void',
            // `human-task-option` is `children[0]` of `human-task` (ADR 0035 (private)'s universal
            // "children[0] can't have an out" rule) — a plain trailing `return` child (not `.out`)
            // sidesteps that for the first option, same as `IHumanTaskFields`/`buildHumanTaskNode`
            // only exposing `children`, never `out`.
            children: [{ id: 'q1-approve-return', name: 'return', data: '' }],
          },
          {
            label: 'Reject',
            dataType: 'string',
            prompt: 'Reason',
            children: [{ id: 'q1-reject-return', name: 'return', data: '' }],
          },
        ],
      );
      const document: IProjectDocument = {
        id: 'doc-1',
        type: 'function',
        name: 'run',
        root: functionNode('doc-1', [humanTaskNode]),
      };

      const result = compileProjectDocuments([document], REGISTERED_INTEGRATIONS);
      // The ask activity's `options` argument is a JSON string literal (double-`JSON.stringify`),
      // matching `askActivitySignature`'s `options: string` — not a bare array-literal expression.
      expect(result.workflows).toContain(
        JSON.stringify(
          JSON.stringify([
            { label: 'Approve', dataType: 'void' },
            { label: 'Reject', dataType: 'string', prompt: 'Reason' },
          ]),
        ),
      );
      expect(result.workflows).toContain('case "Approve": {');
      expect(result.workflows).toContain('case "Reject": {');
    },
  );
});
