import type { INode, IProjectDocument } from '@falang/dto';
import type { IActionDescriptor, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it, vi } from 'vitest';
import { compileFunction } from './compile-function.js';
import { compileProject } from './compile-project.js';
import { DEBUG_RUNTIME_CODE, DEBUG_STATE_QUERY_NAME } from './debug-runtime.js';

const functionNode = (id: string, bodyChildren: INode[] = [], parameters: unknown[] = []): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters }, children: bodyChildren },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

describe('compileProject — debug instrumentation (ADR 0021 (private))', () => {
  it('is off by default: neither the runtime nor any __falangDebug call is emitted', () => {
    const result = compileProject({
      documents: [functionDocument('doc-a', 'greet', functionNode('doc-a', [{ id: 'l1', name: 'log', data: 'hi' }]))],
    });
    expect(result.workflows).not.toContain('__falangDebug');
    expect(result.debugMap).toBeUndefined();
  });

  it("captures a function's parameters but not the editor-only returnValue local", () => {
    const root: INode = {
      id: 'doc-a',
      name: 'function',
      children: [
        { id: 'doc-a-header', name: 'function-header', data: '' },
        {
          id: 'doc-a-body',
          name: 'function-body',
          data: { parameters: [{ name: 'count', type: { type: 'number' } }], returnValue: { type: 'string' } },
          children: [{ id: 'l1', name: 'log', data: 'hi' }],
        },
        { id: 'doc-a-footer', name: 'function-footer', data: '' },
      ],
    };

    const compiled = compileFunction(root, 'greet', {
      debug: { allocateIndex: () => 0, documentId: 'doc-a', onTracePoint: vi.fn() },
    });

    expect(compiled).toContain('() => ({ count })');
    expect(compiled).not.toContain('returnValue');
  });

  it('prepends the runtime, wraps every function body, and returns a debugMap covering every function document', () => {
    const caller = functionNode('doc-caller', [
      { id: 'c1', name: 'call-function', data: { schemeId: 'doc-callee', parameters: [], returnVariable: '' } },
    ]);
    const callee = functionNode('doc-callee', [{ id: 'l2', name: 'log', data: 'calc' }]);

    const result = compileProject({
      documents: [
        functionDocument('doc-caller', 'processOrder', caller),
        functionDocument('doc-callee', 'calculateShipping', callee),
      ],
      debug: true,
    });

    expect(result.workflows).toBe(
      [
        "import { condition, defineQuery, defineSignal, proxyLocalActivities, setHandler } from '@temporalio/workflow';",
        '',
        'const { logActivity } = proxyLocalActivities<{ logActivity(message: string): Promise<string> }>({',
        "  startToCloseTimeout: '10 seconds',",
        '});',
        '',
        DEBUG_RUNTIME_CODE,
        '',
        '// doc-start:processOrder:doc-caller',
        'export async function processOrder(): Promise<void> {',
        '  __falangDebug.enter();',
        '  try {',
        '    // icon-start:call-function:c1',
        '    await __falangDebug.trace(0, () => ({}));',
        '    await calculateShipping();',
        '    // icon-end:call-function:c1',
        '  } finally {',
        '    __falangDebug.leave();',
        '  }',
        '}',
        '// doc-end:processOrder:doc-caller',
        '',
        '// doc-start:calculateShipping:doc-callee',
        'export async function calculateShipping(): Promise<void> {',
        '  __falangDebug.enter();',
        '  try {',
        '    // icon-start:log:l2',
        '    await __falangDebug.trace(1, () => ({}));',
        '    await logActivity(`calc`);',
        '    // icon-end:log:l2',
        '  } finally {',
        '    __falangDebug.leave();',
        '  }',
        '}',
        '// doc-end:calculateShipping:doc-callee',
      ].join('\n'),
    );
    expect(DEBUG_RUNTIME_CODE).toContain(`'${DEBUG_STATE_QUERY_NAME}'`);
    expect(result.debugMap).toEqual({
      tracePoints: [
        { index: 0, documentId: 'doc-caller', nodeId: 'c1', variables: [] },
        { index: 1, documentId: 'doc-callee', nodeId: 'l2', variables: [] },
      ],
    });
  });

  it('instruments trigger-function documents too, after their trigger signal wait', () => {
    const integration: IWorkflowIntegration = {
      vendor: 'acme',
      actions: [],
      triggers: [
        {
          name: 'on-thing',
          signalName: 'acme-on-thing',
          scopeVariableName: 'thing',
          scopeType: { type: 'string' },
        } as unknown as IWorkflowIntegration['triggers'][number],
      ],
    } as unknown as IWorkflowIntegration;
    const root: INode = {
      id: 't1',
      name: 'trigger-function',
      children: [
        { id: 't1-header', name: 'trigger-function-header', data: '' },
        {
          id: 't1-body',
          name: 'trigger-function-body',
          data: { vendor: 'acme', triggerName: 'on-thing', credentialId: 'cred' },
          children: [{ id: 'l1', name: 'log', data: 'got it' }],
        },
        { id: 't1-footer', name: 'trigger-function-footer', data: '' },
      ],
    };
    const document: IProjectDocument = { id: 'doc-t', type: 'trigger-function', name: 'onThing', root };

    const result = compileProject({ documents: [document], integrations: [integration], debug: true });
    expect(result.workflows).toContain('__falangDebug.trace');
    expect(result.debugMap?.tracePoints.map((point) => [point.documentId, point.nodeId])).toEqual([['doc-t', 'l1']]);
    expect(result.workflows.indexOf('await condition(() => hasSignal);')).toBeLessThan(
      result.workflows.indexOf('__falangDebug.trace('),
    );
  });

  it('combines with trackPosition: __falangAt then __falangDebug.trace at each statement, debug wrap outside the position wrap', () => {
    const result = compileProject({
      documents: [functionDocument('doc-a', 'greet', functionNode('doc-a', [{ id: 'l1', name: 'log', data: 'hi' }]))],
      trackPosition: true,
      debug: true,
    });
    expect(result.workflows).toContain(
      [
        'export async function greet(): Promise<void> {',
        '  __falangDebug.enter();',
        '  try {',
        '    __falangEnter("doc-a");',
        '    try {',
        '      // icon-start:log:l1',
        '      __falangAt("l1");',
        '      await __falangDebug.trace(0, () => ({}));',
        '      await logActivity(`hi`);',
        '      // icon-end:log:l1',
        '    } catch (error) {',
        '      throw __falangFailure(error);',
        '    } finally {',
        '      __falangLeave();',
        '    }',
        '  } finally {',
        '    __falangDebug.leave();',
        '  }',
        '}',
      ].join('\n'),
    );
  });

  it("a call-ai-text-style action's new-variable field is visible to a later statement's debug trace (ADR 0039 (private) §3 — backend registration)", () => {
    // `getScopeContribution` (called from `node-emitters.ts` when `debug: true`) only sees a vendor
    // action's result variable if something registered a contributor for it — the editor does this via
    // `@falang/workflow-scheme`'s `IntegrationsModule`, which never runs on the backend/compiler. This
    // is the regression test for that gap: `compileProject` itself must register contributors (see its
    // own call to `registerIntegrationScopeContributors`).
    const callAiTextAction: IActionDescriptor = {
      name: 'call-ai-text',
      label: 'Call AI (text)',
      fields: [
        { name: 'result', label: 'Result', kind: 'result-type' },
        { name: 'resultVariable', label: 'Result variable', kind: 'new-variable' },
      ],
      resultType: (fields) => {
        try {
          const parsed = JSON.parse(fields.result || '{}') as { type?: string; id?: string };
          if (parsed.type === 'struct' && parsed.id) return { type: 'struct', id: parsed.id, constant: true };
        } catch {
          // fall through to the string default below
        }
        return { type: 'string', constant: true };
      },
      emit: (fields) =>
        fields.resultVariable ? `const ${fields.resultVariable} = await callAiText();` : 'await callAiText();',
      activityCode: '',
      activitySignature: 'callAiText(): Promise<string>',
    };
    const aiIntegration: IWorkflowIntegration = {
      vendor: 'openai',
      label: 'OpenAI-compatible',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [callAiTextAction],
    };
    const root = functionNode('doc-a', [
      { id: 'call-1', name: 'call-ai-text', data: { result: '{"type":"string"}', resultVariable: 'answer' } },
      { id: 'log-1', name: 'log', data: 'done' },
    ]);

    const result = compileProject({
      documents: [functionDocument('doc-a', 'greet', root)],
      integrations: [aiIntegration],
      debug: true,
    });

    expect(result.debugMap?.tracePoints).toEqual([
      { index: 0, documentId: 'doc-a', nodeId: 'call-1', variables: [] },
      { index: 1, documentId: 'doc-a', nodeId: 'log-1', variables: [{ name: 'answer', type: 'string' }] },
    ]);
  });

  it('a function parameter is visible from the very first statement', () => {
    let next = 0;
    const code = compileFunction(
      functionNode('doc-p', [{ id: 'l1', name: 'log', data: 'name' }], [{ name: 'name', type: { type: 'string' } }]),
      'greet',
      {
        debug: {
          documentId: 'doc-p',
          allocateIndex: () => {
            const index = next;
            next += 1;
            return index;
          },
          onTracePoint: vi.fn(),
        },
      },
    );
    expect(code).toContain('await __falangDebug.trace(0, () => ({ name }));');
  });
});
