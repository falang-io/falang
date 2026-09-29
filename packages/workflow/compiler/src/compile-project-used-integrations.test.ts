import type { INode, IProjectDocument } from '@falang/dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { compileProject } from './compile-project.js';
import { selectUsedIntegrations } from './used-integrations.js';

// Only integrations the documents actually use reach the compiled output.

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

const vendor = (name: string, extra: Partial<IWorkflowIntegration> = {}): IWorkflowIntegration => ({
  vendor: name,
  label: name,
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  sharedActivityCode: `const ${name}Shared = 1;`,
  actions: [
    {
      name: `${name}-action`,
      label: `${name} action`,
      fields: [],
      emit: () => `await ${name}Action();`,
      activityCode: `export const ${name}Action = async () => ${name}Shared;`,
      activitySignature: `${name}Action(): Promise<void>`,
    },
  ],
  ...extra,
});

const activepiecesNode: INode = {
  id: 'ap1',
  name: 'activepieces-action',
  data: { pieceName: 'slack', actionName: 'send', credentialId: 'c1', propsValue: {} },
};

describe('selectUsedIntegrations', () => {
  it('keeps vendors referenced anywhere in a tree (nested children, out) in registration order', () => {
    const vendorA = vendor('vendorA');
    const vendorB = vendor('vendorB');
    const vendorC = vendor('vendorC');
    const root = functionNode('doc', [
      {
        id: 'w1',
        name: 'while',
        data: 'true',
        children: [{ id: 'c1', name: 'vendorC-action', data: {} }],
        out: { id: 'a1', name: 'vendorA-action', data: {} },
      },
    ]);

    const used = selectUsedIntegrations([functionDocument('doc', 'run', root)], [vendorA, vendorB, vendorC]);

    expect(used.integrations.map((integration) => integration.vendor)).toEqual(['vendorA', 'vendorC']);
    expect(used.usesActivepiecesAction).toBe(false);
  });

  it('counts question and choice node kinds as usage', () => {
    const asking = vendor('asking', {
      actions: [],
      questions: [
        {
          name: 'asking-question',
          label: 'Ask',
          contextFields: [],
          questionFields: [],
          answerSignalName: 'answer',
          askActivitySignature: 'askingAsk(): Promise<void>',
          askActivityCode: 'export const askingAsk = async () => {};',
          resolveActivitySignature: 'askingResolve(): Promise<void>',
          resolveActivityCode: 'export const askingResolve = async () => {};',
        },
      ],
    });
    const root = functionNode('doc', [{ id: 'q1', name: 'asking-question', data: {}, children: [] }]);

    const used = selectUsedIntegrations([functionDocument('doc', 'run', root)], [asking, vendor('other')]);

    expect(used.integrations.map((integration) => integration.vendor)).toEqual(['asking']);
  });
});

describe('compileProject — unused integrations', () => {
  it('emits activity code and proxies only for vendors the documents use', () => {
    const fn = functionNode('doc-fn', [{ id: 'u1', name: 'used-action', data: {} }]);

    const result = compileProject({
      documents: [functionDocument('doc-fn', 'run', fn)],
      integrations: [vendor('used'), vendor('unused')],
    });

    expect(result.activities).toContain('const usedShared = 1;');
    expect(result.activities).toContain('export const usedAction');
    expect(result.activities).not.toContain('unused');
    expect(result.activities).not.toContain('runActivepiecesAction');
    expect(result.workflows).toContain('const { logActivity, usedAction } = proxyLocalActivities<');
    expect(result.workflows).not.toContain('unusedAction');
    expect(result.workflows).not.toContain('runActivepiecesAction');
  });

  it('emits nothing but logActivity for a project with no integration nodes', () => {
    const fn = functionNode('doc-fn', [{ id: 'l1', name: 'log', data: 'hi' }]);

    const result = compileProject({
      documents: [functionDocument('doc-fn', 'run', fn)],
      integrations: [vendor('unused')],
    });

    expect(result.activities).toContain('export const logActivity');
    expect(result.activities).not.toContain('unused');
    expect(result.workflows).not.toContain('unused');
  });

  it('emits runActivepiecesAction only when an activepieces-action node is present', () => {
    const fn = functionNode('doc-fn', [activepiecesNode]);

    const result = compileProject({ documents: [functionDocument('doc-fn', 'run', fn)] });

    expect(result.activities).toContain('export const runActivepiecesAction');
    expect(result.workflows).toContain('const { logActivity, runActivepiecesAction } = proxyLocalActivities<');
  });

  it('ignores integration nodes in documents that are not compiled', () => {
    const structure: IProjectDocument = {
      id: 'doc-struct',
      type: 'objects-structure',
      name: 'Types',
      root: { id: 'x', name: 'used-action', data: {} },
    };
    const fn = functionNode('doc-fn');

    const result = compileProject({
      documents: [functionDocument('doc-fn', 'run', fn), structure],
      integrations: [vendor('used')],
    });

    expect(result.activities).not.toContain('usedAction');
  });
});
