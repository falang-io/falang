import type { INode } from '@falang/dto';
import { buildNodeKindsCatalog, describeNodeKind, validateDocument } from '@falang/mcp-core';
import { TRIGGER_FUNCTION_NAME } from '@falang/workflow-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { openaiIntegration } from '@falang/workflow-integrations-openai';
import { telegramIntegration } from '@falang/workflow-integrations-telegram';
import { describe, expect, it } from 'vitest';
import { buildWorkflowMcpRegistry } from './workflow-mcp-registry.js';

const fakeIntegration: IWorkflowIntegration = {
  vendor: 'fake-vendor',
  label: 'Fake Vendor',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [
    {
      name: 'fake-vendor-do-thing',
      label: 'Do thing',
      fields: [{ name: 'target', label: 'Target', kind: 'text' }],
      emit: (fields) => `fakeVendorDoThing(${fields.target})`,
      activityCode: 'export const fakeVendorDoThing = async () => {};',
      activitySignature: 'fakeVendorDoThing(target: string): Promise<void>',
    },
  ],
};

describe('buildWorkflowMcpRegistry', () => {
  it('registers function/trigger-function/objects-structure for the workflow project type', () => {
    const registry = buildWorkflowMcpRegistry([]);
    expect([...registry.getDocumentTypes('workflow')].toSorted()).toEqual(
      ['function', 'objects-structure', TRIGGER_FUNCTION_NAME].toSorted(),
    );
  });

  it('includes the base function/trigger-function/activepieces-action node kinds even with no integrations', () => {
    const registry = buildWorkflowMcpRegistry([]);
    const stack = registry.getStack('workflow', 'function');
    if (!stack) throw new Error('expected a "function" stack to be registered for "workflow"');
    const names = buildNodeKindsCatalog(stack).nodeKinds.map((kind) => kind.name);
    expect(names).toContain('function');
    expect(names).toContain('function-body');
    expect(names).toContain('activepieces-action');
  });

  it('layers a registered integration action onto the workflow stack as its own node kind', () => {
    const registry = buildWorkflowMcpRegistry([fakeIntegration]);
    const stack = registry.getStack('workflow', 'function');
    if (!stack) throw new Error('expected a "function" stack to be registered for "workflow"');
    const names = buildNodeKindsCatalog(stack).nodeKinds.map((kind) => kind.name);
    expect(names).toContain('fake-vendor-do-thing');
  });

  it('validates a real document tree using a layered-in vendor action node', () => {
    const registry = buildWorkflowMcpRegistry([fakeIntegration]);
    const functionRoot = registry.getDefaultRoot('workflow', 'function') as INode;
    const body = functionRoot.children?.find((child) => child.name === 'function-body');
    if (!body) throw new Error('expected the default function tree to have a function-body child');

    const actionNode: INode = {
      id: 'action-1',
      name: 'fake-vendor-do-thing',
      data: { target: 'x' },
      children: [],
    };
    const bodyWithAction: INode = { ...body, children: [actionNode] };
    const newRoot: INode = {
      ...functionRoot,
      children: functionRoot.children?.map((child) => (child === body ? bodyWithAction : child)),
    };

    const result = validateDocument('workflow', { id: 'doc-1', type: 'function', name: 'fn', root: newRoot }, registry);
    expect(result.ok).toBe(true);
  });

  it('shares the same NodesStack instance between function and trigger-function so both see the same node kinds', () => {
    const registry = buildWorkflowMcpRegistry([]);
    expect(registry.getStack('workflow', 'function')).toBe(registry.getStack('workflow', TRIGGER_FUNCTION_NAME));
  });

  it("rejects a trigger-function node nested inside a plain function document's function-body", () => {
    // Regression test for a real user-hit bug: because `function` and `trigger-function` share one
    // NodesStack (see the test above), `get_node_kinds`/`insert_node` used to let the in-app agent nest
    // a `trigger-function` root node inside a `function` document's own `function-body` — a structurally
    // invalid tree that still passed `validateDocument` (`children: true` treated it as "any node in the
    // stack" rather than "any statement node"). See `INodeConfig.documentRootOnly` in `@falang/dto`.
    const registry = buildWorkflowMcpRegistry([]);
    const functionRoot = registry.getDefaultRoot('workflow', 'function') as INode;
    const body = functionRoot.children?.find((child) => child.name === 'function-body');
    if (!body) throw new Error('expected the default function tree to have a function-body child');

    const nestedTriggerFunction: INode = {
      id: 'trigger-function-1',
      name: TRIGGER_FUNCTION_NAME,
      children: [
        { id: 'header-1', name: 'function-header', data: '' },
        {
          id: 'trigger-body-1',
          name: 'trigger-function-body',
          children: [],
          data: {
            vendor: 'telegram',
            triggerName: 'telegram-trigger',
            credentialId: '',
            scopeVariableName: 'update',
            scopeType: { type: 'any' },
          },
        },
        { id: 'footer-1', name: 'function-footer', data: '' },
      ],
    };
    const bodyWithTriggerFunction: INode = { ...body, children: [nestedTriggerFunction] };
    const newRoot: INode = {
      ...functionRoot,
      children: functionRoot.children?.map((child) => (child === body ? bodyWithTriggerFunction : child)),
    };

    const result = validateDocument('workflow', { id: 'doc-1', type: 'function', name: 'fn', root: newRoot }, registry);
    expect(result.ok).toBe(false);
  });

  it("surfaces telegram-question's button semantics via get_node_kinds' notes, not just its bare schema", () => {
    // Regression test for a real user-hit bug: the in-app agent, seeing only `telegram-question`'s bare
    // JSON Schema (`options: string[]`, no hint that these become tappable buttons), built a Telegram
    // Q&A bot's yes/no logic as a `switch` matching the *next incoming message's* lowercased text
    // instead. `NODE_KIND_NOTES` (`@falang/mcp-core`) now carries that explanation.
    const registry = buildWorkflowMcpRegistry([telegramIntegration]);
    const stack = registry.getStack('workflow', 'function');
    if (!stack) throw new Error('expected a "function" stack to be registered for "workflow"');

    const question = describeNodeKind('telegram-question', stack);
    expect(question.notes).toContain('button');
    expect(question.notes).toContain('switch');

    const option = describeNodeKind('telegram-question-option', stack);
    expect(option.notes).toContain('button');
  });

  it("surfaces call-ai-choice's notes pointing at a vendor question node for actually asking a human", () => {
    const registry = buildWorkflowMcpRegistry([openaiIntegration]);
    const stack = registry.getStack('workflow', 'function');
    if (!stack) throw new Error('expected a "function" stack to be registered for "workflow"');

    const choice = describeNodeKind('call-ai-choice', stack);
    expect(choice.notes).toContain('telegram-question');
  });
});
