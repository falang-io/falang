import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileFunction } from './compile-function.js';
import { compileProject } from './compile-project.js';
import { compileTriggerFunction } from './compile-trigger-function.js';
import { compileStatements } from './node-emitters.js';
import { POSITION_QUERY_NAME, POSITION_RUNTIME_CODE } from './position-runtime.js';
import { throwUnresolvedCallFunction } from './resolve-function-name.js';

const functionNode = (id: string, bodyChildren: INode[] = []): INode => ({
  id,
  name: 'function',
  children: [
    { id: `${id}-header`, name: 'function-header', data: '' },
    { id: `${id}-body`, name: 'function-body', data: { parameters: [] }, children: bodyChildren },
    { id: `${id}-footer`, name: 'function-footer', data: '' },
  ],
});

const functionDocument = (id: string, name: string, root: INode): IProjectDocument => ({
  id,
  type: 'function',
  name,
  root,
});

describe('compileProject — position tracking (ADR 0022 (private))', () => {
  it('is off by default: neither the runtime nor any __falangAt call is emitted', () => {
    const result = compileProject({
      documents: [functionDocument('doc-a', 'greet', functionNode('doc-a', [{ id: 'l1', name: 'log', data: 'hi' }]))],
    });
    expect(result.workflows).not.toContain('__falang');
    expect(result.workflows).not.toContain('defineQuery');
  });

  it('prepends the runtime, extends the @temporalio/workflow import, and wraps every function body', () => {
    const caller = functionNode('doc-caller', [
      { id: 'c1', name: 'call-function', data: { schemeId: 'doc-callee', parameters: [], returnVariable: '' } },
    ]);
    const callee = functionNode('doc-callee', [{ id: 'l2', name: 'log', data: 'calc' }]);

    const result = compileProject({
      documents: [
        functionDocument('doc-caller', 'processOrder', caller),
        functionDocument('doc-callee', 'calculateShipping', callee),
      ],
      trackPosition: true,
    });

    expect(result.workflows).toBe(
      [
        "import { ApplicationFailure, condition, defineQuery, defineSignal, isCancellation, proxyLocalActivities, setHandler } from '@temporalio/workflow';",
        '',
        'const { logActivity, runActivepiecesAction } = proxyLocalActivities<{ logActivity(message: string): Promise<string>; runActivepiecesAction(credentialId: string, pieceName: string, actionName: string, propsValue: Record<string, unknown>): Promise<unknown> }>({',
        "  startToCloseTimeout: '10 seconds',",
        '});',
        '',
        POSITION_RUNTIME_CODE,
        '',
        '// doc-start:processOrder:doc-caller',
        'export async function processOrder(): Promise<void> {',
        '  __falangEnter("doc-caller");',
        '  try {',
        '    // icon-start:call-function:c1',
        '    __falangAt("c1");',
        '    await calculateShipping();',
        '    // icon-end:call-function:c1',
        '  } catch (error) {',
        '    throw __falangFailure(error);',
        '  } finally {',
        '    __falangLeave();',
        '  }',
        '}',
        '// doc-end:processOrder:doc-caller',
        '',
        '// doc-start:calculateShipping:doc-callee',
        'export async function calculateShipping(): Promise<void> {',
        '  __falangEnter("doc-callee");',
        '  try {',
        '    // icon-start:log:l2',
        '    __falangAt("l2");',
        '    await logActivity(`calc`);',
        '    // icon-end:log:l2',
        '  } catch (error) {',
        '    throw __falangFailure(error);',
        '  } finally {',
        '    __falangLeave();',
        '  }',
        '}',
        '// doc-end:calculateShipping:doc-callee',
      ].join('\n'),
    );
    expect(POSITION_RUNTIME_CODE).toContain(`defineQuery<__FalangPositionFrame[]>('${POSITION_QUERY_NAME}')`);
  });

  it('records nested statements too, innermost inside its own markers', () => {
    const log: INode = { id: 'l1', name: 'log', data: 'x' };
    const thenChild: INode = { id: 'then', name: 'if-child', children: [log] };
    const elseChild: INode = { id: 'else', name: 'if-child', children: [] };
    const ifNode: INode = { id: 'if1', name: 'if', data: 'true', children: [thenChild, elseChild] };

    expect(compileStatements([ifNode], throwUnresolvedCallFunction, {}, {}, true)).toBe(
      [
        '// icon-start:if:if1',
        '__falangAt("if1");',
        'if (true) {',
        '  // icon-start:log:l1',
        '  __falangAt("l1");',
        '  await logActivity(`x`);',
        '  // icon-end:log:l1',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });

  it('wraps an empty function body as well, so even a no-op function is entered and left', () => {
    expect(compileFunction(functionNode('doc-e'), 'noop', { trackPosition: { documentId: 'doc-e' } })).toBe(
      [
        'export async function noop(): Promise<void> {',
        '  __falangEnter("doc-e");',
        '  try {',
        '',
        '  } catch (error) {',
        '    throw __falangFailure(error);',
        '  } finally {',
        '    __falangLeave();',
        '  }',
        '}',
      ].join('\n'),
    );
  });

  it('puts a trigger function’s signal wait inside the tracked region', () => {
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

    const code = compileTriggerFunction(root, 'onThing', [integration], { trackPosition: { documentId: 'doc-t' } });
    const lines = code.split('\n');
    expect(lines[1]).toBe('  __falangEnter("doc-t");');
    expect(lines[2]).toBe('  try {');
    expect(code).toContain('    await condition(() => hasSignal);\n    // icon-start:log:l1\n    __falangAt("l1");');
    expect(lines.slice(-6)).toEqual([
      '  } catch (error) {',
      '    throw __falangFailure(error);',
      '  } finally {',
      '    __falangLeave();',
      '  }',
      '}',
    ]);
  });
});
