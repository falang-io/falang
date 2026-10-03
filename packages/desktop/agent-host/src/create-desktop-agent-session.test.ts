import 'reflect-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { ScriptedLlmClient } from '@falang/agent';
import { registerGlobalTokens, type Scheme } from '@falang/scheme';
import { buildSketchDocumentScheme } from './sketch/build-sketch-document-scheme.js';
import { createSketchProjectContainer } from './sketch/create-sketch-project-container.js';
import {
  createDesktopAgentDocumentResolver,
  createDesktopAgentSession,
  type IDesktopAgentDocument,
  type IDesktopAgentStore,
} from './create-desktop-agent-session.js';

class FakeStore implements IDesktopAgentStore {
  readonly documents: IDesktopAgentDocument[] = [
    { id: 'fn', name: 'main', type: 'function' },
    { id: 'types', name: 'Types', type: 'objects-structure' },
  ];
  private readonly container = createSketchProjectContainer('logic');
  readonly schemes = new Map<string, Scheme>();

  getDocument(documentId: string): IDesktopAgentDocument | undefined {
    return this.documents.find((doc) => doc.id === documentId);
  }

  getScheme(documentId: string): Scheme {
    const existing = this.schemes.get(documentId);
    if (existing) return existing;
    const doc = this.getDocument(documentId);
    if (!doc) throw new Error('unknown');
    const scheme = buildSketchDocumentScheme({
      doc: { ...doc, type: doc.type as 'function' },
      parentContainer: this.container,
    });
    this.schemes.set(documentId, scheme);
    return scheme;
  }
}

describe('createDesktopAgentDocumentResolver', () => {
  const stores: FakeStore[] = [];
  afterEach(() => {
    for (const store of stores.splice(0)) for (const scheme of store.schemes.values()) scheme.dispose();
  });

  it('resolves an agent-capable document to its scheme and rejects unknown / non-capable ones', () => {
    registerGlobalTokens();
    const store = new FakeStore();
    stores.push(store);
    const resolver = createDesktopAgentDocumentResolver('sketch', store);
    expect(resolver.resolve('fn')).toBe(store.getScheme('fn'));
    expect(() => resolver.resolve('nope')).toThrow('was not found');
    expect(() => resolver.resolve('types')).toThrow('not a document the agent can edit');
  });
});

describe('createDesktopAgentSession', () => {
  it('offers only agent-capable documents to the LLM and fires onOpenDocument for each resolved tool call', async () => {
    registerGlobalTokens();
    const store = new FakeStore();
    const body = store.getScheme('fn').rootNode?.children.find((child) => child.name === 'function-body');
    if (!body) throw new Error('no function-body');
    const client = new ScriptedLlmClient([
      { text: '', toolCalls: [{ id: '1', input: { documentId: 'fn', parentId: body.id }, name: 'get_node_kinds' }] },
      { text: '', toolCalls: [{ id: '2', input: { message: 'done' }, name: 'finish' }] },
    ]);
    const opened: string[] = [];
    const session = createDesktopAgentSession({
      focusPauseMs: 0,
      llmClient: client,
      onOpenDocument: (id) => opened.push(id),
      product: 'sketch',
      store,
    });
    await session.run('hi', { activeDocumentId: 'fn' });
    expect(session.status).toBe('done');
    expect(opened).toEqual(['fn']);
    const system = client.requests[0]?.system ?? '';
    expect(system).toContain('main');
    expect(system).not.toContain('Types');
    for (const scheme of store.schemes.values()) scheme.dispose();
  });
});
