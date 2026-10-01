import { ScriptedLlmClient, type ILlmResponse } from '@falang/agent';
import type { Scheme } from '@falang/scheme';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDocument } from '../workflow-types.js';
import { createWorkflowMagicRunStore, getMagicHostScheme } from './create-workflow-magic-run-store.js';
import { buildMagicScheme, magicNode } from './magic-test-helpers.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

const toolCall = (name: string, input: unknown): ILlmResponse => ({ text: '', toolCalls: [{ id: name, input, name }] });

const documents: WorkflowDocument[] = [
  { folderId: null, id: 'doc', name: 'fn', type: 'function' },
  { folderId: null, id: 'types', name: 'types', type: 'objects-structure' },
  { folderId: null, id: 'integrations', name: 'integrations', pinned: true, type: 'integrations' },
];

const buildStore = (scheme: Scheme): IWorkflowAgentStore =>
  ({
    documents,
    getDocument: (id: string) => documents.find((doc) => doc.id === id),
    getScheme: () => scheme,
  }) as unknown as IWorkflowAgentStore;

describe('getMagicHostScheme', () => {
  it('returns the scheme of a function document only', () => {
    const scheme = buildMagicScheme([]);
    const store = buildStore(scheme);
    expect(getMagicHostScheme(store, 'doc')).toBe(scheme);
    expect(getMagicHostScheme(store, 'types')).toBeNull();
    expect(getMagicHostScheme(store, 'integrations')).toBeNull();
    expect(getMagicHostScheme(store, 'nope')).toBeNull();
    scheme.dispose();
  });
});

describe('createWorkflowMagicRunStore', () => {
  const disposables: { dispose: () => void }[] = [];
  afterEach(() => {
    for (const item of disposables.splice(0)) item.dispose();
  });

  it('runs a magic node with the host wiring: magic write tool + list_types, no document creation', async () => {
    const scheme = buildMagicScheme([magicNode('m', [], 'increment')]);
    const client = new ScriptedLlmClient([
      toolCall('fill_magic_node', { children: [{ data: 'a = 1', name: 'action' }], nodeId: 'm' }),
      toolCall('finish', { message: 'done' }),
    ]);
    const store = createWorkflowMagicRunStore({
      createLlmClient: () => client,
      focusPauseMs: 0,
      getAllowQuestions: () => false,
      store: buildStore(scheme),
    });
    disposables.push(store, scheme);

    store.startGenerate('doc', 'm');
    await vi.waitFor(() => expect(store.getState('doc', 'm').status).toBe('idle'));

    expect(scheme.nodes.getNode('m').children.map((child) => child.data)).toEqual(['a = 1']);
    const names = client.requests[0].tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['fill_magic_node', 'get_tree', 'get_node_kinds', 'list_types']));
    expect(names).toEqual(expect.arrayContaining(['search_integrations', 'create_integration_instance']));
    expect(names).not.toContain('create_document');
    expect(names).not.toContain('insert_node');
    expect(names).not.toContain('ask_user');
  });
});
