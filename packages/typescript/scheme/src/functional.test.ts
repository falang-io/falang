import { container as rootContainer } from '@falang/di';
import { CMD_VALENCE_POINT_CLICKED, registerGlobalTokens } from '@falang/scheme';
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
