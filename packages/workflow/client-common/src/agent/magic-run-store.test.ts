// oxlint-disable max-lines -- one scripted-LLM scenario per store behaviour
import { ScriptedLlmClient, type ILlmResponse, type TScriptedStep } from '@falang/agent';
import { resolveService } from '@falang/di';
import { CMD_INSERT_NODE, TOKEN_HISTORY, type Scheme } from '@falang/scheme';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MagicRunStore, MAGIC_MAX_STEPS } from './magic-run-store.js';
import { actionNode, buildMagicScheme, magicNode } from './magic-test-helpers.js';

const toolCall = (name: string, input: unknown, id = name): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input, name }],
});
const fill = (children: unknown[], note?: string, nodeId = 'm'): ILlmResponse =>
  toolCall('fill_magic_node', { children, nodeId, ...(note ? { note } : {}) });
const finish = (message: string): ILlmResponse => toolCall('finish', { message });
const act = (data: string) => ({ data, name: 'action' });

describe('MagicRunStore', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let store: MagicRunStore;
  // oxlint-disable-next-line init-declarations
  let client: ScriptedLlmClient;
  let allowQuestions = true;
  const setup = (script: TScriptedStep[], body = [magicNode('m', [], 'send a greeting')]) => {
    scheme = buildMagicScheme(body);
    client = new ScriptedLlmClient(script);
    allowQuestions = true;
    store = new MagicRunStore({
      createContextProviders: () => [],
      createLlmClient: () => client,
      createToolProviders: () => [],
      getAllowQuestions: () => allowQuestions,
      getScheme: (documentId) => (documentId === 'doc' ? scheme : null),
    });
  };
  const status = (nodeId = 'm') => store.getState('doc', nodeId).status;
  const settled = (expected: string, nodeId = 'm') => vi.waitFor(() => expect(status(nodeId)).toBe(expected));
  const children = (id = 'm') => scheme.nodes.getNode(id).children.map((child) => child.data);
  const history = () => resolveService(TOKEN_HISTORY, scheme.container);

  afterEach(() => {
    store?.dispose();
    scheme?.dispose();
  });

  it('generate fills the node in one undo step, sets the note, never touches the chat', async () => {
    setup([fill([act('a = 1'), act('b = 2')], 'used the default bot'), finish('done')]);
    store.startGenerate('doc', 'm');
    expect(status()).toBe('generating');
    await settled('idle');
    expect(children()).toEqual(['a = 1', 'b = 2']);
    expect(scheme.nodes.getNode('m').meta?.note).toBe('used the default bot');
    expect(scheme.nodes.getNode('m').meta?.handEdited).toBeUndefined();
    history().back();
    expect(children()).toEqual([]);
    expect(scheme.nodes.getNode('m').meta?.note).toBeUndefined();

    const first = client.requests[0];
    expect(first.messages[0]).toMatchObject({ content: 'Implement this step: send a greeting', role: 'user' });
    expect(first.system).toContain('GENERATE');
    const names = first.tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining(['get_tree', 'get_node_kinds', 'finish', 'fill_magic_node', 'ask_user']),
    );
    expect(names).not.toContain('insert_node');
    expect(MAGIC_MAX_STEPS).toBe(12);
  });

  it('falls back to the finish line as the note (its own undo step)', async () => {
    setup([fill([act('a = 1')]), finish('Used placeholder chat id')]);
    store.startGenerate('doc', 'm');
    await settled('idle');
    expect(scheme.nodes.getNode('m').meta?.note).toBe('Used placeholder chat id');
    history().back();
    expect(children()).toEqual(['a = 1']);
    history().back();
    expect(children()).toEqual([]);
  });

  it('update carries the old and the new text and replaces the children', async () => {
    setup([fill([act('new = 1')], 'n'), finish('ok')], [magicNode('m', [actionNode('x', 'old = 1')], 'new text')]);
    store.startUpdate('doc', 'm', 'old text', 'new text');
    await settled('idle');
    const request = client.requests[0].messages[0];
    expect(JSON.stringify(request)).toContain('Old text: old text');
    expect(JSON.stringify(request)).toContain('New text: new text');
    expect(children()).toEqual(['new = 1']);
  });

  it('asks a question, then the answer continues the same conversation', async () => {
    setup([
      toolCall('ask_user', { options: [{ label: 'Reuse bot' }, { label: 'New bot' }], question: 'Which bot?' }),
      fill([act('a = 1')], 'reused'),
      finish('ok'),
    ]);
    store.startGenerate('doc', 'm');
    await settled('asking');
    expect(store.getState('doc', 'm').question?.question).toBe('Which bot?');
    expect(store.isBusy('doc', 'm')).toBe(true);
    expect(children()).toEqual([]);

    store.answer('doc', 'm', { option: 'Reuse bot' });
    expect(status()).toBe('generating');
    await settled('idle');
    expect(children()).toEqual(['a = 1']);
    expect(client.requests[1].messages.length).toBeGreaterThan(client.requests[0].messages.length);
    expect(JSON.stringify(client.requests[1].messages)).toContain('Reuse bot');
  });

  it('does not offer ask_user when questions are off', async () => {
    setup([fill([act('a = 1')], 'n'), finish('ok')]);
    allowQuestions = false;
    store.startGenerate('doc', 'm');
    await settled('idle');
    expect(client.requests[0].tools.map((tool) => tool.name)).not.toContain('ask_user');
  });

  it('a failure shows the message; retry re-runs the same request', async () => {
    setup([
      () => {
        throw new Error('vendor down');
      },
      fill([act('a = 1')], 'n'),
      finish('ok'),
    ]);
    store.startGenerate('doc', 'm');
    await settled('failed');
    expect(store.getState('doc', 'm').error).toContain('vendor down');
    expect(store.isBusy('doc', 'm')).toBe(false);
    store.retry('doc', 'm');
    await settled('idle');
    expect(children()).toEqual(['a = 1']);
    expect(JSON.stringify(client.requests[1].messages[0])).toContain('send a greeting');
  });

  it('finishing without filling is a failure', async () => {
    setup([finish('I could not do it')]);
    store.startGenerate('doc', 'm');
    await settled('failed');
    expect(store.getState('doc', 'm').error).toBe('I could not do it');
  });

  it('cancel returns to idle without an error', () => {
    setup([
      () =>
        new Promise<ILlmResponse>((_resolve) => {
          // never settles: the run is cancelled
        }),
    ]);
    store.startGenerate('doc', 'm');
    expect(status()).toBe('generating');
    store.cancel('doc', 'm');
    expect(status()).toBe('idle');
    expect(store.getState('doc', 'm').error).toBeNull();
  });

  it('runs several nodes at once with separate sessions', () => {
    setup(
      [
        (_params, turn) =>
          turn === 0 || turn === 1 ? toolCall('get_tree', { documentId: 'doc' }, `t${turn}`) : finish('x'),
      ],
      [magicNode('m1', [], 'one'), magicNode('m2', [], 'two')],
    );
    store.startGenerate('doc', 'm1');
    store.startGenerate('doc', 'm2');
    expect(status('m1')).toBe('generating');
    expect(status('m2')).toBe('generating');
    store.cancel('doc', 'm1');
    expect(status('m1')).toBe('idle');
    expect(status('m2')).toBe('generating');
  });

  it('does not hold the undo history while paused between steps; one undo removes only the fill', async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<boolean>();
    setup([
      toolCall('get_tree', { documentId: 'doc' }),
      async () => {
        await gate;
        return fill([act('a = 1')], 'n');
      },
      finish('ok'),
    ]);
    store.startGenerate('doc', 'm');
    await vi.waitFor(() => expect(client.requests).toHaveLength(2));
    const bodyCount = () => scheme.nodes.getNode('b').children.length;
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: 0, node: actionNode('u1'), parentId: 'b' });
    expect(bodyCount()).toBe(2);
    expect(() => history().back()).not.toThrow();
    expect(bodyCount()).toBe(1);
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: 0, node: actionNode('u2'), parentId: 'b' });
    release(true);
    await settled('idle');
    expect(children()).toEqual(['a = 1']);
    history().back();
    expect(children()).toEqual([]);
    expect(scheme.nodes.getNode('b').children.map((child) => child.id)).toEqual(['u2', 'm']);
  });

  describe('host', () => {
    it('a spell committed on a node with no steps starts generating', async () => {
      setup([fill([act('a = 1')], 'n'), finish('ok')]);
      store.createHost('doc').onSpellCommitted('m', '', 'send a greeting');
      expect(status()).toBe('generating');
      await settled('idle');
    });

    it('with steps it asks first; Update with AI runs an update, Keep as is does nothing', async () => {
      setup([fill([act('n = 1')], 'n'), finish('ok')], [magicNode('m', [actionNode('x', 'o = 1')], 'new')]);
      const host = store.createHost('doc');
      host.onSpellCommitted('m', 'old', 'new');
      expect(store.pendingConfirm?.kind).toBe('update');
      store.resolveConfirm(false);
      expect(store.pendingConfirm).toBeNull();
      expect(status()).toBe('idle');
      expect(client.requests).toHaveLength(0);

      host.onSpellCommitted('m', 'old', 'new');
      store.resolveConfirm(true);
      expect(status()).toBe('generating');
      await settled('idle');
      expect(JSON.stringify(client.requests[0].messages[0])).toContain('Old text: old');
    });

    it('Regenerate (prev === next) asks with its own wording and generates', async () => {
      setup([fill([act('n = 1')], 'n'), finish('ok')], [magicNode('m', [actionNode('x', 'o = 1')], 'same')]);
      store.createHost('doc').onSpellCommitted('m', 'same', 'same');
      expect(store.pendingConfirm?.kind).toBe('regenerate');
      store.resolveConfirm(true);
      await settled('idle');
      expect(client.requests[0].system).toContain('GENERATE');
    });

    it('reports status and filling, and opens the editor', () => {
      setup([]);
      const host = store.createHost('doc');
      expect(host.getStatus('m')).toBe('idle');
      expect(host.isFilling?.('m')).toBe(false);
      host.openEditor('m');
      expect(store.openEditor).toEqual({ documentId: 'doc', nodeId: 'm' });
      store.closeEditor();
      expect(store.openEditor).toBeNull();
    });
  });

  describe('applyEdit (popup OK)', () => {
    it('writes spell and steps in one undo step and marks handEdited, without flagging itself twice', () => {
      setup([], [magicNode('m', [actionNode('x', 'o = 1')], 'old')]);
      const ok = store.applyEdit('doc', 'm', {
        children: [actionNode('y', 'p = 1'), actionNode('z', 'q = 1')],
        handEdited: true,
        spell: 'new',
      });
      expect(ok).toBe(true);
      const node = scheme.nodes.getNode('m');
      expect((node.data as { spell: string }).spell).toBe('new');
      expect(children()).toEqual(['p = 1', 'q = 1']);
      expect(node.meta?.handEdited).toBe(true);
      history().back();
      expect((scheme.nodes.getNode('m').data as { spell: string }).spell).toBe('old');
      expect(children()).toEqual(['o = 1']);
      expect(scheme.nodes.getNode('m').meta?.handEdited).toBeUndefined();
    });

    it('a spell-only change keeps the steps and does not set handEdited', () => {
      setup([], [magicNode('m', [actionNode('x', 'o = 1')], 'old')]);
      store.applyEdit('doc', 'm', { children: [actionNode('x', 'o = 1')], handEdited: false, spell: 'new' });
      expect(children()).toEqual(['o = 1']);
      expect(scheme.nodes.getNode('m').children[0].id).toBe('x');
      expect(scheme.nodes.getNode('m').meta?.handEdited).toBeUndefined();
    });

    it('does nothing when nothing changed and reports a missing node', () => {
      setup([], [magicNode('m', [actionNode('x')], 'same')]);
      store.applyEdit('doc', 'm', { children: [actionNode('x')], handEdited: false, spell: 'same' });
      expect(() => history().back()).not.toThrow();
      expect(store.applyEdit('doc', 'missing', { children: [], handEdited: false, spell: '' })).toBe(false);
    });
  });
});
