import { describe, expect, it } from 'vitest';
import { AgentSession, ScriptedLlmClient, type IAgentDocumentResolver, type ILlmResponse } from '@falang/agent';
import { HistoryModule, schemeFactory, type Scheme } from '@falang/scheme';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import type { WorkflowDocument } from '../workflow-types.js';
import type { WorkflowStore } from '../workflow-store.js';
import { DocumentToolProvider } from './document-tool-provider.js';

/**
 * Sanity check, at the "Workflow host" level, for ADR 0036 (private)'s "no home document" amendment:
 * a brand-new project with zero documents is still workable — the agent can `create_document` (no
 * active document required, since `IAgentToolProvider` calls never touch a `Scheme`) and then read the
 * freshly created document back via `get_tree({ documentId })`, all without any `activeDocumentId` ever
 * being passed to `run()`. Doesn't construct a real `WorkflowStore` (its constructor does real
 * network/IndexedDB I/O) — `DocumentToolProvider` only needs a `createDocument` method, faked here the
 * same way `document-tool-provider.test.ts` already fakes the store.
 */
describe('agent flow in an empty project (ADR 0036 (private), "no home document")', () => {
  it('create_document then get_tree(documentId) succeeds with no active document open', async () => {
    const documents = new Map<string, Scheme>();
    const newDocScheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule()],
    });
    const fakeStore = {
      createDocument: () => {
        documents.set('new-doc', newDocScheme);
        return 'new-doc';
      },
      documents: [] as WorkflowDocument[],
    } as unknown as WorkflowStore;
    const documentToolProvider = new DocumentToolProvider(fakeStore);

    const resolver: IAgentDocumentResolver = {
      resolve: (documentId) => {
        const scheme = documents.get(documentId);
        if (!scheme) throw new Error(`Document ${documentId} not found`);
        return scheme;
      },
    };

    const script = [
      (): ILlmResponse => ({
        text: '',
        toolCalls: [{ id: 't1', input: { name: 'myFunc', type: 'function' }, name: 'create_document' }],
      }),
      (): ILlmResponse => ({
        text: '',
        toolCalls: [{ id: 't2', input: { documentId: 'new-doc' }, name: 'get_tree' }],
      }),
      (): ILlmResponse => ({
        text: '',
        toolCalls: [{ id: 't3', input: { message: 'done' }, name: 'finish' }],
      }),
    ];
    const client = new ScriptedLlmClient(script);

    // `defaultScheme: null` and no `activeDocumentId` passed to `run()` below — there is no document
    // open in the editor at all, the exact scenario this amendment exists for.
    const session = new AgentSession(null, client, [], {
      documentResolver: resolver,
      toolProviders: [documentToolProvider],
    });

    await session.run('build me something');

    expect(session.status).toBe('done');
    expect(session.error).toBe('');
    const createStep = session.steps.find((step) => step.call.name === 'create_document');
    const treeStep = session.steps.find((step) => step.call.name === 'get_tree');
    expect(createStep?.result.ok).toBe(true);
    expect(treeStep?.result.ok).toBe(true);
    if (treeStep?.result.ok) {
      expect(treeStep.result.content).toContain('function');
    }
  });
});
