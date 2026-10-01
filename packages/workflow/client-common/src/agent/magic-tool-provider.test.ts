import { resolveService } from '@falang/di';
import { TOKEN_HISTORY, type Scheme } from '@falang/scheme';
import { TOKEN_MAGIC_HOST } from '@falang/workflow-scheme/src/magic/magic-host.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FILL_MAGIC_NODE_TOOL, MagicToolProvider } from './magic-tool-provider.js';
import { actionNode, buildMagicScheme, magicNode } from './magic-test-helpers.js';

const call = (input: unknown) => ({ id: 'c', input, name: FILL_MAGIC_NODE_TOOL });
const childIds = (scheme: Scheme, id: string) => scheme.nodes.getNode(id).children.map((child) => child.id);

describe('MagicToolProvider', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  afterEach(() => scheme?.dispose());

  const setup = (children = [actionNode('x1'), actionNode('x2')], meta?: Record<string, boolean>) => {
    scheme = buildMagicScheme([actionNode('a1'), magicNode('m', children, 'old', meta)]);
    const setFilling = vi.fn();
    const onFilled = vi.fn();
    const provider = new MagicToolProvider({ getScheme: () => scheme, nodeId: 'm', onFilled, setFilling });
    return { onFilled, provider, setFilling };
  };

  it('replaces every child in one undo step, clears handEdited and stores the note', () => {
    const { onFilled, provider, setFilling } = setup([actionNode('x1'), actionNode('x2')], { handEdited: true });
    const result = provider.execute(
      call({
        children: [
          { data: 'a = 1', name: 'action' },
          { data: 'b = 2', name: 'action' },
        ],
        nodeId: 'm',
        note: ' used bot 1 ',
      }),
    );
    expect(result.ok).toBe(true);
    const node = scheme.nodes.getNode('m');
    expect(node.children.map((child) => child.data)).toEqual(['a = 1', 'b = 2']);
    expect(node.meta?.handEdited).toBeUndefined();
    expect(node.meta?.note).toBe('used bot 1');
    expect(onFilled).toHaveBeenCalledWith({ noted: true });
    expect(setFilling.mock.calls).toEqual([
      ['m', true],
      ['m', false],
    ]);
    resolveService(TOKEN_HISTORY, scheme.container).back();
    expect(childIds(scheme, 'm')).toEqual(['x1', 'x2']);
    expect(scheme.nodes.getNode('m').meta?.handEdited).toBe(true);
  });

  it('does not flag handEdited while the host says it is filling', () => {
    setup([]);
    const filling = new Set<string>();
    scheme.container.registerInstance(TOKEN_MAGIC_HOST, {
      getStatus: () => 'idle',
      isFilling: (id: string) => filling.has(id),
      onSpellCommitted: vi.fn(),
      openEditor: vi.fn(),
    });
    const real = new MagicToolProvider({
      getScheme: () => scheme,
      nodeId: 'm',
      setFilling: (id: string, on: boolean) => (on ? filling.add(id) : filling.delete(id)),
    });
    expect(real.execute(call({ children: [{ data: 'a = 1', name: 'action' }], nodeId: 'm' })).ok).toBe(true);
    expect(scheme.nodes.getNode('m').meta?.handEdited).toBeUndefined();
  });

  it('refuses any node other than the run own one', () => {
    const { onFilled, provider } = setup();
    const result = provider.execute(call({ children: [], nodeId: 'b' }));
    expect(result.ok).toBe(false);
    expect(childIds(scheme, 'm')).toEqual(['x1', 'x2']);
    expect(onFilled).not.toHaveBeenCalled();
  });

  it('is atomic on an invalid spec and names its path', () => {
    const { provider } = setup();
    const result = provider.execute(
      call({ children: [{ data: 'a', name: 'action' }, { name: 'no-such' }], nodeId: 'm' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('children[1]');
    expect(childIds(scheme, 'm')).toEqual(['x1', 'x2']);
  });

  it('rejects a nested magic node', () => {
    const { provider } = setup();
    expect(provider.execute(call({ children: [{ data: { spell: 'x' }, name: 'magic' }], nodeId: 'm' })).ok).toBe(false);
  });

  it('accepts a JSON-encoded children list', () => {
    const { provider } = setup();
    const result = provider.execute(call({ children: JSON.stringify([{ data: 'z', name: 'action' }]), nodeId: 'm' }));
    expect(result.ok).toBe(true);
    expect(scheme.nodes.getNode('m').children).toHaveLength(1);
  });
});
