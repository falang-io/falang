import { afterEach, describe, expect, it } from 'vitest';
import { countourNodeConfig, mindTreeCfg, NodesGroup, zod, type IDataInfo, type INode } from '@falang/dto';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { SchemeInfrastructure } from '../scheme/scheme-infrastructure.js';
import { IconsGroup } from '../scheme/icons-group.js';
import { insertNode } from '../actions/insert-node.js';
import { getContourIconNodeConfig } from '../icons/contour/contour.icon.config.js';
import { getMindTreeIconConfig } from '../icons/mind-tree/mind-tree.icon.config.js';
import { emptyBlockConfig } from './empty-block.js';
import { getSchemeBounds } from './get-scheme-bounds.js';

// `NodesStack.factory('contour')` omits `children: []` on the `children: true` kinds (a known, pre-existing gap),
// which its own validator then rejects — fill it in here.
const withEmptyChildren = (node: INode): INode => ({
  ...node,
  ...(node.children || /-(function-body|finish)$/.test(node.name)
    ? { children: (node.children ?? []).map((child) => withEmptyChildren(child)) }
    : {}),
});

describe('getSchemeBounds', () => {
  const schemes: Scheme[] = [];
  const build = (scheme: Scheme): Scheme => {
    schemes.push(scheme);
    return scheme;
  };
  afterEach(() => {
    schemes.splice(0).forEach((scheme) => scheme.dispose());
  });

  it('returns null when the scheme has no document', () => {
    const scheme = build(schemeFactory({ infra: getTestInfrastructure() }));
    expect(getSchemeBounds(scheme)).toBeNull();
  });

  it('measures an empty function document', () => {
    const scheme = build(schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() }));
    const bounds = getSchemeBounds(scheme);
    expect(bounds).not.toBeNull();
    expect(bounds?.width).toBe((bounds?.left ?? 0) + (bounds?.right ?? 0));
    expect(bounds?.width).toBeGreaterThan(0);
    expect(bounds?.height).toBeGreaterThan(0);
  });

  it('grows taller as nodes are inserted', () => {
    const scheme = build(schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() }));
    const before = getSchemeBounds(scheme);
    const bodyId = scheme.rootNode?.children[1].id;
    if (!bodyId || !before) throw new Error('Root not set');
    insertNode({ index: 0, node: scheme.infra.structure.factory('action'), parentId: bodyId }, scheme);
    insertNode({ index: 1, node: scheme.infra.structure.factory('action'), parentId: bodyId }, scheme);
    const after = getSchemeBounds(scheme);
    expect(after?.height).toBeGreaterThan(before.height);
  });

  it('counts the whole contour (not just its header) in a contour root height', () => {
    const str = { type: zod.string(), default: () => '' } as const satisfies IDataInfo;
    const nodes = new NodesGroup(
      countourNodeConfig({
        name: 'contour',
        data: str,
        headerData: str,
        functionData: str,
        functionReturnData: str,
        finishData: str,
        finishFooterData: str,
      }),
    );
    const icons = new IconsGroup(
      nodes,
      getContourIconNodeConfig({
        name: 'contour',
        data: emptyBlockConfig,
        header: emptyBlockConfig,
        functionData: emptyBlockConfig,
        functionReturn: emptyBlockConfig,
        finishData: emptyBlockConfig,
        finishFooterData: emptyBlockConfig,
      }),
    );
    const infra = new SchemeInfrastructure([icons]);
    const scheme = build(
      schemeFactory({
        infra,
        document: { id: 'c', name: 'contour-doc', root: withEmptyChildren(infra.structure.factory('contour')) },
      }),
    );
    const root = scheme.rootIcon as unknown as { header: { height: number } } | null;
    const bounds = getSchemeBounds(scheme);
    if (!root || !bounds) throw new Error('Root not built');
    expect(bounds.height).toBeGreaterThan(root.header.height);
  });
});

describe('getSchemeBounds: layouts that draw outside the root icon box', () => {
  it('covers mind-tree threads whose wide blocks stick out left of the root (declared left = 0)', () => {
    const str = { type: zod.string(), default: () => '' } as const satisfies IDataInfo;
    const nodes = new NodesGroup(mindTreeCfg({ name: 'tree', header: str, body: str, thread: str, child: str }));
    const wide = { ...emptyBlockConfig, defaultWidth: 300 };
    const icons = new IconsGroup(
      nodes,
      getMindTreeIconConfig({
        name: 'tree',
        header: emptyBlockConfig,
        body: emptyBlockConfig,
        thread: wide,
        child: wide,
      }),
    );
    const infra = new SchemeInfrastructure([icons]);
    const scheme = schemeFactory({
      infra,
      document: { id: 't', name: 'tree-doc', root: infra.structure.factory('tree') },
    });
    try {
      const root = scheme.rootIcon;
      const bounds = getSchemeBounds(scheme);
      if (!root || !bounds) throw new Error('Root not built');
      expect(root.left).toBe(0);
      const leftmost = Math.min(
        ...scheme.icons.all.map((icon) => icon.x + icon.blockPosition.x - icon.config.shape.paddings.left),
      );
      expect(leftmost).toBeLessThan(0);
      expect(bounds.left).toBeGreaterThanOrEqual(-leftmost);
      expect(bounds.width).toBe(bounds.left + bounds.right);
    } finally {
      scheme.dispose();
    }
  });
});
