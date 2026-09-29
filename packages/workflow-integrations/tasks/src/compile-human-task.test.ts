import type { INode, IProjectDocument } from '@falang/dto';
import { compileProject } from '@falang/workflow-compiler';
import { describe, expect, it } from 'vitest';
import { tasksIntegration } from './tasks.integration.js';

/**
 * A real `compileProject` pass over a `human-task` node — the compiler-level counterpart to
 * `tasks.integration.test.ts`'s descriptor assertions, exercising the exact shape
 * `question-emitters.ts` produces for a descriptor with `timeoutField`/`answerScope.perOptionData`/
 * `optionDataTypes`/`closeActivitySignature` all set together (nothing else in the codebase combines
 * all four yet — `telegram-question` has the first three but not `optionDataTypes`).
 */

const humanTaskNode = (id: string): INode => ({
  id,
  name: 'human-task',
  data: {
    title: 'Approve this order?',
    description: 'Please check the amount before approving.',
    payload: 'order',
    attachments: '',
    timeout: '48h',
    options: ['Approve', 'Reject'],
  },
  children: [
    { id: `${id}-approve`, name: 'human-task-option', data: { label: 'Approve', dataType: 'void' }, children: [] },
    {
      id: `${id}-reject`,
      name: 'human-task-option',
      data: { label: 'Reject', dataType: 'string', prompt: 'Reason' },
      children: [],
    },
    {
      id: `${id}-timeout`,
      name: 'human-task-option',
      data: { label: 'timeout', dataType: 'void', fixed: true },
      children: [],
    },
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
      data: { vendor: 'tasks', triggerName: 'test-trigger' },
      children: bodyChildren,
    },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

describe('compileProject with a human-task node', () => {
  it('compiles ask -> timed wait -> resolve/close -> switch with per-option typed data and a task scope variable', () => {
    const integration = {
      ...tasksIntegration,
      triggers: [
        {
          name: 'test-trigger',
          label: 'Test trigger',
          notes: 'Test trigger.',
          scopeType: { type: 'any' as const },
          scopeVariableName: 'payload',
          signalName: 'testSignal',
          webhookPath: '/webhooks/tasks/:credentialId/:env',
        },
      ],
    };
    const document: IProjectDocument = {
      id: 'doc-trigger',
      type: 'trigger-function',
      name: 'onWebhook',
      root: triggerFunctionNode('doc-trigger', [humanTaskNode('q1')]),
    };

    const result = compileProject({ documents: [document], integrations: [integration] });

    // The ask call: payload was filled in ('order'), attachments was left blank -> `undefined`, not
    // an empty argument slot (see question-emitters.ts's resolveField fix).
    expect(result.workflows).toContain(
      'humanTaskAsk(`Approve this order?`, `Please check the amount before approving.`, order, undefined, ',
    );
    // Full option data (label+dataType+prompt), not bare labels, is what reaches the ask activity —
    // as a *string-literal* argument (askActivitySignature's `options: string`, `JSON.parse`d by the
    // activity), hence the outer `JSON.stringify` on top of the JSON text itself.
    expect(result.workflows).toContain(
      JSON.stringify(
        JSON.stringify([
          { label: 'Approve', dataType: 'void' },
          { label: 'Reject', dataType: 'string', prompt: 'Reason' },
        ]),
      ),
    );
    // The fixed timeout option never appears in that JSON blob.
    const askCallStart = result.workflows.indexOf('humanTaskAsk(');
    const askCallEnd = result.workflows.indexOf(');', askCallStart);
    expect(result.workflows.slice(askCallStart, askCallEnd)).not.toContain('"fixed"');

    // 48h -> 48 * 3600 * 1000 ms
    expect(result.workflows).toContain('await condition(() => q_q1HasAnswer, 172800000);');
    // Cancellation-safety wrapper (closeActivitySignature is set).
    expect(result.workflows).toContain('try {');
    expect(result.workflows).toContain('if (isCancellation(e)) {');
    expect(result.workflows).toContain('await CancellationScope.nonCancellable(() => humanTaskClose(');
    // Timeout branch closes with 'expired'.
    expect(result.workflows).toContain("await humanTaskClose(q_q1MessageId, 'expired');");
    // answerScope: a `task` variable is declared after a real answer resolves.
    expect(result.workflows).toContain('const task: any = { id: q_q1MessageId,');
    // perOptionData: the Reject branch gets a typed `data` local, Approve (void) gets none.
    expect(result.workflows).toContain('const data = q_q1Payload!.data as string;');
    expect(result.workflows).toContain('case "Approve": {');
    expect(result.workflows).toContain('case "Reject": {');
    expect(result.workflows).toContain("case '__timeout__': {");

    expect(result.activities).toContain('export const humanTaskAsk');
    expect(result.activities).toContain('export const humanTaskResolve');
    expect(result.activities).toContain('export const humanTaskClose');
    expect(result.activities).toContain("import { Context } from '@temporalio/activity';");
  });
});
