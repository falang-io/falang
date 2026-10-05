import { container as rootContainer } from '@falang/di';
import { CMD_VALENCE_POINT_CLICKED, registerGlobalTokens, TOKEN_CONTEXT_MENU } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { NodesStack } from '@falang/dto';
import { functionNodesGroup } from '@falang/typescript-dto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { functionalSchemeFactory } from './functional.js';

describe('functionalSchemeFactory defaultInsertNodeName', () => {
  afterEach(() => vi.restoreAllMocks());

  const build = (defaultInsertNodeName?: () => string) => {
    registerGlobalTokens();
    const root = new NodesStack([functionNodesGroup]).factory('function');
    return functionalSchemeFactory({
      parentContainer: rootContainer,
      defaultInsertNodeName,
      document: { id: 'd', type: 'function', name: 'doc', root },
    });
  };
  const clickBody = (scheme: ReturnType<typeof build>) => {
    const body = scheme.rootNode?.children[1];
    if (!body) throw new Error('no body');
    const vp = { parentId: body.id, index: 0 } as never;
    scheme.commands.dispatchCommand(CMD_VALENCE_POINT_CLICKED, { e: {} as never, vp });
    return body.children.map((c) => c.name);
  };

  it('inserts an action by default', () => {
    const scheme = build();
    expect(clickBody(scheme)).toEqual(['action']);
    scheme.dispose();
  });

  it('reads the getter on every click', () => {
    let name = 'log';
    const scheme = build(() => name);
    expect(clickBody(scheme)).toEqual(['log']);
    name = 'action';
    // the second click inserts at index 0 again, in front of the first
    expect(clickBody(scheme)).toEqual(['action', 'log']);
    scheme.dispose();
  });
});

describe('functionalSchemeFactory extraInsertableGroups', () => {
  const build = (extraInsertableGroups: Parameters<typeof functionalSchemeFactory>[0]['extraInsertableGroups']) => {
    registerGlobalTokens();
    const root = new NodesStack([functionNodesGroup]).factory('function');
    return functionalSchemeFactory({
      parentContainer: rootContainer,
      extraInsertableGroups,
      document: { id: 'd', type: 'function', name: 'doc', root },
    });
  };
  const menuGroups = (scheme: ReturnType<typeof build>): { name: string; items: string[] }[] => {
    const body = scheme.rootNode?.children[1];
    if (!body) throw new Error('no body');
    const parent = scheme.icons.getIcon(body.id);
    const menu = resolveService(TOKEN_CONTEXT_MENU, scheme.container).buildForValencePoint({
      scheme,
      parent,
      vp: { parentId: body.id, index: 0 } as never,
    });
    return menu
      .filter((item) => item.type === 'group')
      .map((group) => ({
        name: group.text,
        items: group.children.map((child) => (child.type === 'button' ? child.text : '')),
      }));
  };

  it('adds each extra group as its own submenu with final labels, skipping empty ones', () => {
    const scheme = build([
      { label: 'Arduino', items: [{ name: 'action', label: 'Set pin' }] },
      { label: 'Device', items: [] },
    ]);
    const groups = menuGroups(scheme);
    expect(groups.find((group) => group.name === 'Arduino')?.items).toEqual(['Set pin']);
    expect(groups.some((group) => group.name === 'Device')).toBe(false);
    scheme.dispose();
  });

  it('re-reads a getter on every menu build', () => {
    let items: string[] = [];
    const scheme = build(() => [{ label: 'Device', items }]);
    expect(menuGroups(scheme).some((group) => group.name === 'Device')).toBe(false);
    items = ['log'];
    expect(menuGroups(scheme).some((group) => group.name === 'Device')).toBe(true);
    scheme.dispose();
  });
});
