import { describe, expect, it, vi } from 'vitest';
import { ScriptedLlmClient, type ILlmResponse } from '@falang/agent';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';
import type { WorkflowDocument } from '../workflow-types.js';
import { createWorkflowAgentSession } from './create-workflow-agent-session.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

const finish = (): ILlmResponse => ({ text: '', toolCalls: [{ id: 'f', input: { message: 'done' }, name: 'finish' }] });

const documents: WorkflowDocument[] = [
  { folderId: null, id: 'doc-1', name: 'sendGreeting', type: 'function' },
  { folderId: null, id: 'integrations', name: 'integrations', pinned: true, type: INTEGRATIONS_DOCUMENT_TYPE },
];

const buildStore = (): IWorkflowAgentStore =>
  ({
    documents,
    getDocument: (id: string) => documents.find((doc) => doc.id === id),
    getScheme: () => {
      throw new Error('no schemes in this test');
    },
  }) as unknown as IWorkflowAgentStore;

describe('createWorkflowAgentSession', () => {
  it('offers the core node tools plus the document and integration providers', async () => {
    const client = new ScriptedLlmClient([finish()]);
    const session = createWorkflowAgentSession({ focusPauseMs: 0, llmClient: client, store: buildStore() });

    await session.run('hello');

    expect(session.status).toBe('done');
    const names = client.requests[0].tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'get_tree',
        'get_node_kinds',
        'insert_node',
        'insert_nodes',
        'finish',
        'ask_user',
        'create_document',
        'create_trigger_document',
        'list_types',
        'search_integrations',
        'list_integration_instances',
        'create_integration_instance',
      ]),
    );
  });

  it('feeds the model the project documents (never pinned ones) through its context providers', async () => {
    const client = new ScriptedLlmClient([finish()]);
    const session = createWorkflowAgentSession({ llmClient: client, store: buildStore() });

    await session.run('hello', { activeDocumentId: 'doc-1' });

    expect(client.requests[0].system).toContain('sendGreeting');
    expect(client.requests[0].system).not.toContain('integrations');
  });

  it('calls onRunFinished with the session once the run settles', async () => {
    const onRunFinished = vi.fn();
    const session = createWorkflowAgentSession({
      llmClient: new ScriptedLlmClient([finish()]),
      onRunFinished,
      store: buildStore(),
    });

    await session.run('hello');

    expect(onRunFinished).toHaveBeenCalledTimes(1);
    expect(onRunFinished).toHaveBeenCalledWith(session);
  });

  it('acquires a lock and opens the tab for a document a tool call resolves, never for an unknown one', async () => {
    const acquireLock = vi.fn();
    const onOpenDocument = vi.fn();
    const client = new ScriptedLlmClient([
      { text: '', toolCalls: [{ id: 'a', input: { documentId: 'missing' }, name: 'get_tree' }] },
      finish(),
    ]);
    const session = createWorkflowAgentSession({ acquireLock, llmClient: client, onOpenDocument, store: buildStore() });

    await session.run('hello');

    expect(session.steps[0].result.ok).toBe(false);
    expect(acquireLock).not.toHaveBeenCalled();
    expect(onOpenDocument).not.toHaveBeenCalled();
  });
});
