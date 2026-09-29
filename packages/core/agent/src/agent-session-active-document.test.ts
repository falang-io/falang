import { describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentSession } from './agent-session.js';
import type { IAgentDocumentResolver } from './document-resolver.js';
import type { ILlmResponse } from './llm-client.js';
import type { TScriptedStep } from './scripted-llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';
import type { IAgentToolProvider } from './tool-provider.js';

const bodyId = '2';

const buildScheme = (): Scheme =>
  schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule()],
  });

const insertCall = (id: string, index: number, documentId?: string): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input: { documentId, index, name: 'action', parentId: bodyId }, name: 'insert_node' }],
});

const finishCall = (id: string): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input: { message: 'done' }, name: 'finish' }],
});

describe('AgentSession — no "home document" (ADR 0036 amendment)', () => {
  it('a session with no defaultScheme and no activeDocumentId can still run — provider tools and finish need no document at all', async () => {
    const provider: IAgentToolProvider = {
      execute: () => ({ content: JSON.stringify({ ok: true }), ok: true }),
      tools: [{ description: '', inputSchema: { type: 'object' }, name: 'do_thing' }],
    };
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({ text: '', toolCalls: [{ id: 't1', input: {}, name: 'do_thing' }] }),
      (): ILlmResponse => finishCall('t2'),
    ];
    const client = new ScriptedLlmClient(script);
    const session = new AgentSession(null, client, [], { toolProviders: [provider] });

    await session.run('build something from scratch');

    expect(session.status).toBe('done');
    expect(session.message).toBe('done');
  });

  it('a documentId-less core tool call fails clearly when there is no active document and no defaultScheme', async () => {
    const script: TScriptedStep[] = [(): ILlmResponse => insertCall('t1', 0), (): ILlmResponse => finishCall('t2')];
    const client = new ScriptedLlmClient(script);
    const session = new AgentSession(null, client, []);

    await session.run('do it');

    expect(session.status).toBe('done');
    expect(session.steps[0].result).toEqual({
      error: 'documentId is required — no document is open in the editor',
      ok: false,
    });
  });

  it('system prompt says no document is open, and never includes a tree or node-kinds catalog, when nothing is active', async () => {
    const client = new ScriptedLlmClient([]);
    const session = new AgentSession(null, client, [
      { describe: (context) => `active=${String(context.activeDocumentId)}` },
    ]);

    await session.run('hello');

    expect(session.status).toBe('done');
    const system = client.requests[0].system;
    expect(system).toContain('No document is open in the editor.');
    expect(system).toContain('active=null');
    expect(system).not.toContain('Node kinds');
    expect(system).not.toContain('Current tree');
  });

  it("a documentId-less core call resolves against the run's effective active document id", async () => {
    const targetScheme = buildScheme();
    const resolvedIds: string[] = [];
    const resolver: IAgentDocumentResolver = {
      resolve: (id) => {
        resolvedIds.push(id);
        return targetScheme;
      },
    };
    const script: TScriptedStep[] = [(): ILlmResponse => insertCall('t1', 0), (): ILlmResponse => finishCall('t2')];
    const client = new ScriptedLlmClient(script);
    const session = new AgentSession(null, client, [], { documentResolver: resolver });

    await session.run('do it', { activeDocumentId: 'doc-active' });

    expect(session.status).toBe('done');
    expect(resolvedIds).toEqual(['doc-active']);
    expect(targetScheme.nodes.getNode(bodyId).children).toHaveLength(1);
  });

  it("the run's effective active document id is captured once at start — a documentId-less call after onOpenDocument still resolves against the original, even if the host now tracks a different document as active", async () => {
    const resolvedIds: string[] = [];
    let hostTrackedActiveId = 'doc-a';
    const resolver: IAgentDocumentResolver = {
      resolve: (id) => {
        resolvedIds.push(id);
        return buildScheme();
      },
    };
    const script: TScriptedStep[] = [
      // Explicit documentId, fires onOpenDocument, which (in this test double) simulates a host that now
      // treats the just-opened document as "active" — a real tab-follow would do exactly this.
      (): ILlmResponse => insertCall('t1', 0, 'doc-b'),
      // Implicit — must still target the id this run started with, not the host's now-mutated tracking.
      (): ILlmResponse => insertCall('t2', 0),
      (): ILlmResponse => finishCall('t3'),
    ];
    const client = new ScriptedLlmClient(script);
    const session = new AgentSession(null, client, [], {
      documentResolver: resolver,
      onOpenDocument: () => {
        hostTrackedActiveId = 'doc-b';
      },
    });

    await session.run('do it', { activeDocumentId: 'doc-a' });

    expect(session.status).toBe('done');
    expect(resolvedIds).toEqual(['doc-b', 'doc-a']);
    expect(hostTrackedActiveId).toBe('doc-b');
  });

  it('a resolver throw becomes a failed tool result, and never fires onOpenDocument', async () => {
    const opened: Scheme[] = [];
    const resolver: IAgentDocumentResolver = {
      resolve: (id) => {
        if (id === 'missing') throw new Error('no such document: missing');
        return buildScheme();
      },
    };
    const script: TScriptedStep[] = [
      (): ILlmResponse => insertCall('t1', 0, 'missing'),
      (): ILlmResponse => finishCall('t2'),
    ];
    const client = new ScriptedLlmClient(script);
    const session = new AgentSession(null, client, [], {
      documentResolver: resolver,
      onOpenDocument: (scheme) => opened.push(scheme),
    });

    await session.run('do it', { activeDocumentId: 'home' });

    expect(session.status).toBe('done');
    expect(session.steps[0].result).toEqual({ error: 'no such document: missing', ok: false });
    expect(opened).toEqual([]);
  });

  it(
    'onOpenDocument fires before every successfully-resolved core call — including the active document ' +
      "itself — right before the tool is applied, never on a resolver throw, and never for a provider's tool",
    async () => {
      const homeScheme = buildScheme();
      const otherScheme = buildScheme();
      const opened: string[] = [];
      const childrenAtOpenTime: number[] = [];
      const resolver: IAgentDocumentResolver = {
        resolve: (id) => {
          if (id === 'missing') throw new Error('no such document: missing');
          return id === 'other' ? otherScheme : homeScheme;
        },
      };
      const provider: IAgentToolProvider = {
        execute: () => ({ content: '{}', ok: true }),
        tools: [{ description: '', inputSchema: { type: 'object' }, name: 'do_thing' }],
      };
      const script: TScriptedStep[] = [
        // Targets the active document itself — must still fire onOpenDocument (no more "never for home").
        (): ILlmResponse => insertCall('t1', 0),
        (): ILlmResponse => insertCall('t2', 0, 'other'),
        // Fails to resolve — never fires.
        (): ILlmResponse => insertCall('t3', 0, 'missing'),
        // A provider tool — never fires, there is no target Scheme at all.
        (): ILlmResponse => ({ text: '', toolCalls: [{ id: 't4', input: {}, name: 'do_thing' }] }),
        (): ILlmResponse => finishCall('t5'),
      ];
      const client = new ScriptedLlmClient(script);
      const session = new AgentSession(homeScheme, client, [], {
        documentResolver: resolver,
        onOpenDocument: (scheme) => {
          opened.push(scheme === homeScheme ? 'home' : 'other');
          childrenAtOpenTime.push(scheme.nodes.getNode(bodyId).children.length);
        },
        toolProviders: [provider],
      });

      await session.run('do it', { activeDocumentId: 'home' });

      expect(session.status).toBe('done');
      expect(opened).toEqual(['home', 'other']);
      // Fired before each call's own mutation was applied.
      expect(childrenAtOpenTime).toEqual([0, 0]);
      expect(homeScheme.nodes.getNode(bodyId).children).toHaveLength(1);
      expect(otherScheme.nodes.getNode(bodyId).children).toHaveLength(1);
    },
  );
});
