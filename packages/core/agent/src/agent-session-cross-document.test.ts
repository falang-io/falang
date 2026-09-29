import { describe, expect, it, vi } from 'vitest';
import type * as SchemeModule from '@falang/scheme';
import type { Scheme } from '@falang/scheme';
import { HistoryModule, focusNode, schemeFactory, TOKEN_HISTORY } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentModule } from './agent.module.js';
import { TOKEN_AGENT_SESSION } from './agent-session.token.js';
import type { IAgentDocumentResolver } from './document-resolver.js';
import type { ILlmResponse } from './llm-client.js';
import type { TScriptedStep } from './scripted-llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';

vi.mock('@falang/scheme', async (importOriginal) => {
  const actual = await importOriginal<typeof SchemeModule>();
  return { ...actual, focusNode: vi.fn(actual.focusNode) };
});

const bodyId = '2';
const OTHER_ID = 'other';

const buildOtherScheme = (withHistory: boolean): Scheme =>
  schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: withHistory ? [new HistoryModule()] : [],
  });

/** `resolveHome` is set by the caller right after this returns, once the home `Scheme` exists — the
 *  resolver only needs it once `AgentSession.run()` actually executes, not at construction time. */
const buildResolver = (otherScheme: Scheme): { resolver: IAgentDocumentResolver; setHome: (home: Scheme) => void } => {
  const box: { home: Scheme | null } = { home: null };
  return {
    resolver: {
      resolve: (id) => (id === OTHER_ID ? otherScheme : (box.home as Scheme)),
    },
    setHome: (home) => {
      box.home = home;
    },
  };
};

interface IBuildHomeSchemeExtras {
  readonly onOpenDocument?: (scheme: Scheme) => void;
  readonly onRunFinished?: () => void;
}

const buildHomeScheme = (
  client: ScriptedLlmClient,
  resolver: IAgentDocumentResolver,
  extras: IBuildHomeSchemeExtras = {},
): Scheme =>
  schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [
      new HistoryModule(),
      new AgentModule({
        documentResolver: resolver,
        llmClient: client,
        onOpenDocument: extras.onOpenDocument,
        onRunFinished: extras.onRunFinished,
      }),
    ],
  });

const insertCall = (id: string, index: number, documentId?: string): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input: { documentId, index, name: 'action', parentId: bodyId }, name: 'insert_node' }],
});

const finishCall = (id: string): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input: { message: 'done' }, name: 'finish' }],
});

describe('AgentSession — cross-document editing (ADR 0034)', () => {
  it('routing: a call with documentId is applied to the other scheme, not the home one', async () => {
    const otherScheme = buildOtherScheme(true);
    const { resolver, setHome } = buildResolver(otherScheme);
    const script: TScriptedStep[] = [
      (): ILlmResponse => insertCall('t1', 0),
      (): ILlmResponse => insertCall('t2', 0, OTHER_ID),
      (): ILlmResponse => finishCall('t3'),
    ];
    const client = new ScriptedLlmClient(script);
    const homeScheme = buildHomeScheme(client, resolver);
    setHome(homeScheme);
    const session = resolveService(TOKEN_AGENT_SESSION, homeScheme.container);

    await session.run('do it');

    expect(session.status).toBe('done');
    expect(homeScheme.nodes.getNode(bodyId).children).toHaveLength(1);
    expect(otherScheme.nodes.getNode(bodyId).children).toHaveLength(1);
  });

  it('per-document undo groups: back() on one document does not touch the other', async () => {
    const otherScheme = buildOtherScheme(true);
    const { resolver, setHome } = buildResolver(otherScheme);
    const script: TScriptedStep[] = [
      (): ILlmResponse => insertCall('t1', 0),
      (): ILlmResponse => insertCall('t2', 0, OTHER_ID),
      (): ILlmResponse => finishCall('t3'),
    ];
    const client = new ScriptedLlmClient(script);
    const homeScheme = buildHomeScheme(client, resolver);
    setHome(homeScheme);
    const session = resolveService(TOKEN_AGENT_SESSION, homeScheme.container);
    const homeHistory = resolveService(TOKEN_HISTORY, homeScheme.container);
    const otherHistory = resolveService(TOKEN_HISTORY, otherScheme.container);

    await session.run('do it');

    expect(homeHistory.isBackAvailable).toBe(true);
    expect(otherHistory.isBackAvailable).toBe(true);

    homeHistory.back();
    expect(homeScheme.nodes.getNode(bodyId).children).toHaveLength(0);
    expect(otherScheme.nodes.getNode(bodyId).children).toHaveLength(1);

    otherHistory.back();
    expect(otherScheme.nodes.getNode(bodyId).children).toHaveLength(0);
  });

  it('focus is applied to the icon before the mutation is applied', async () => {
    const otherScheme = buildOtherScheme(true);
    const { resolver, setHome } = buildResolver(otherScheme);
    const script: TScriptedStep[] = [(): ILlmResponse => insertCall('t1', 0), (): ILlmResponse => finishCall('t2')];
    const client = new ScriptedLlmClient(script);
    const homeScheme = buildHomeScheme(client, resolver);
    setHome(homeScheme);
    const session = resolveService(TOKEN_AGENT_SESSION, homeScheme.container);

    let childrenAtFocusTime = -1;
    const focusNodeMock = vi.mocked(focusNode);
    focusNodeMock.mockImplementationOnce((scheme) => {
      childrenAtFocusTime = scheme.nodes.getNode(bodyId).children.length;
      return true;
    });

    await session.run('do it');

    expect(focusNodeMock).toHaveBeenCalledWith(homeScheme, bodyId);
    expect(childrenAtFocusTime).toBe(0);
    expect(homeScheme.nodes.getNode(bodyId).children).toHaveLength(1);
  });

  it(
    'onOpenDocument fires before every successfully-resolved core call, including calls targeting the ' +
      'home/active document itself (ADR 0036 amendment — no more "never for home")',
    async () => {
      const otherScheme = buildOtherScheme(true);
      const { resolver, setHome } = buildResolver(otherScheme);
      const opened: Scheme[] = [];
      const script: TScriptedStep[] = [
        (): ILlmResponse => insertCall('t1', 0),
        (): ILlmResponse => ({
          text: '',
          toolCalls: [
            {
              id: 't2',
              input: { documentId: OTHER_ID, index: 0, name: 'action', parentId: bodyId },
              name: 'insert_node',
            },
            {
              id: 't3',
              input: { documentId: OTHER_ID, index: 1, name: 'action', parentId: bodyId },
              name: 'insert_node',
            },
          ],
        }),
        (): ILlmResponse => finishCall('t4'),
      ];
      const client = new ScriptedLlmClient(script);
      const homeScheme = buildHomeScheme(client, resolver, { onOpenDocument: (scheme) => opened.push(scheme) });
      setHome(homeScheme);
      const session = resolveService(TOKEN_AGENT_SESSION, homeScheme.container);

      await session.run('do it');

      // t1 (home, implicit), t2 and t3 (other, explicit) — every successfully-resolved core call, not just
      // the first touch of a non-home document.
      expect(opened).toEqual([homeScheme, otherScheme, otherScheme]);
    },
  );

  it('onRunFinished fires once run() settles, after undo groups have closed', async () => {
    const otherScheme = buildOtherScheme(true);
    const { resolver, setHome } = buildResolver(otherScheme);
    const script: TScriptedStep[] = [(): ILlmResponse => insertCall('t1', 0), (): ILlmResponse => finishCall('t2')];
    const client = new ScriptedLlmClient(script);
    let finishedCount = 0;
    const homeScheme = buildHomeScheme(client, resolver, {
      onRunFinished: () => {
        finishedCount += 1;
      },
    });
    setHome(homeScheme);
    const session = resolveService(TOKEN_AGENT_SESSION, homeScheme.container);

    await session.run('do it');

    expect(finishedCount).toBe(1);
  });

  it('missing HistoryModule on the other document is fatal for the run, but home-document steps stay applied', async () => {
    const otherScheme = buildOtherScheme(false);
    const { resolver, setHome } = buildResolver(otherScheme);
    const script: TScriptedStep[] = [
      (): ILlmResponse => insertCall('t1', 0),
      (): ILlmResponse => insertCall('t2', 0, OTHER_ID),
    ];
    const client = new ScriptedLlmClient(script);
    const homeScheme = buildHomeScheme(client, resolver);
    setHome(homeScheme);
    const session = resolveService(TOKEN_AGENT_SESSION, homeScheme.container);
    const homeHistory = resolveService(TOKEN_HISTORY, homeScheme.container);

    await session.run('do it');

    expect(session.status).toBe('error');
    expect(session.error).toContain('HistoryModule');
    expect(homeScheme.nodes.getNode(bodyId).children).toHaveLength(1);

    homeHistory.back();
    expect(homeScheme.nodes.getNode(bodyId).children).toHaveLength(0);
  });
});
