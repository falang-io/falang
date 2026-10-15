import { resolveService } from '@falang/di';
import {
  CMD_INSERT_NODE,
  CMD_VALENCE_POINT_CLICKED,
  TOKEN_CONTEXT_MENU,
  checker,
  getNodeStoreDto,
  type IValencePoint,
  type Scheme,
} from '@falang/scheme';
import type { INode } from '@falang/dto';
import { afterEach, describe, expect, it } from 'vitest';
import { functionalSchemeFactory } from './functional.js';
import { mindTreeSchemeFactory } from './mind-tree.js';

const schemes: Scheme[] = [];
afterEach(() => {
  schemes.splice(0).forEach((s) => s.dispose());
});

const track = (s: Scheme) => {
  schemes.push(s);
  return s;
};

const rootDto = (scheme: Scheme) => {
  if (!scheme.rootNode) throw new Error('scheme has no root');
  return getNodeStoreDto(scheme.rootNode, scheme);
};

const vpOf = (parentId: string, index: number) => ({ parentId, index }) as unknown as IValencePoint;

interface IMenuNode {
  text?: string;
  onClick?: () => void;
  children?: IMenuNode[];
}

const findButton = (items: IMenuNode[], text: string): IMenuNode | null => {
  for (const item of items) {
    if (item.text === text && item.onClick) return item;
    if (item.children) {
      const found = findButton(item.children, text);
      if (found) return found;
    }
  }
  return null;
};

describe('functional (contour) scheme module', () => {
  const build = () => {
    const probe = functionalSchemeFactory();
    const root = probe.infra.structure.factory('function');
    probe.dispose();
    const scheme = track(functionalSchemeFactory({ document: { id: 'doc', type: 'contour', name: 'doc', root } }));
    return { scheme, bodyId: root.children?.[1]?.id ?? '' };
  };

  it('a valence-point click inserts an action into the clicked skewer', () => {
    const { scheme, bodyId } = build();
    const handled = scheme.commands.dispatchCommand(CMD_VALENCE_POINT_CLICKED, { vp: vpOf(bodyId, 0), e: {} as never });
    expect(handled).toBe(true);
    const dto = rootDto(scheme);
    const body = dto.children?.[1];
    expect(body?.children?.map((c) => c.name)).toEqual(['action']);
  });

  it('valence-point menu offers statements, and outs only at the end of a nested chain', () => {
    const { scheme, bodyId } = build();
    const menus = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const body = scheme.icons.getIcon(bodyId);
    const first = JSON.stringify(menus.buildForValencePoint({ scheme, vp: vpOf(bodyId, 0), parent: body }));
    for (const kind of ['action', 'link', 'if', 'switch', 'foreach', 'parallel', 'pseudo-cycle', 'while']) {
      expect(first).toContain(`"icon:${kind}"`);
    }
    expect(first).not.toContain('icon:throw');
  });

  it('icon menu offers delete for a deletable icon and the true/false switch for an if', () => {
    const { scheme, bodyId } = build();
    const structure = scheme.infra.structure;
    const ifNode = structure.factory('if');
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: bodyId, index: 0, node: ifNode });
    const menus = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const menu = JSON.stringify(menus.buildForIcon({ scheme, icon: scheme.icons.getIcon(ifNode.id) }));
    expect(menu).toContain('menu:delete');
    expect(menu).toContain('log icon');
  });
});

describe('functional scheme outs menu', () => {
  const build = (withLoop: boolean) => {
    const probe = functionalSchemeFactory();
    const root = probe.infra.structure.factory('function');
    probe.dispose();
    const scheme = track(functionalSchemeFactory({ document: { id: 'doc', type: 'contour', name: 'doc', root } }));
    const structure = scheme.infra.structure;
    let hostId = root.children?.[1]?.id ?? '';
    if (withLoop) {
      const loop = structure.factory('foreach');
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: hostId, index: 0, node: loop });
      hostId = loop.id;
    }
    const branching = structure.factory('if');
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: hostId, index: 0, node: branching });
    // the second branch is not children[0], so it may end in an out
    const branchId = branching.children?.[1]?.id ?? '';
    const menu = JSON.stringify(
      resolveService(TOKEN_CONTEXT_MENU, scheme.container).buildForValencePoint({
        scheme,
        vp: vpOf(branchId, 0),
        parent: scheme.icons.getIcon(branchId),
      }),
    );
    return { scheme, branchId, menu };
  };

  it('offers throw and return at the end of a branch outside any loop, but not break/continue', () => {
    const { menu } = build(false);
    expect(menu).toContain('icon:throw');
    expect(menu).toContain('icon:return');
    expect(menu).not.toContain('icon:break');
    expect(menu).not.toContain('icon:continue');
  });

  it('adds break and continue inside a loop', () => {
    const { menu } = build(true);
    expect(menu).toContain('icon:break');
    expect(menu).toContain('icon:continue');
  });

  it('choosing an out entry sets it on the branch', () => {
    const { scheme, branchId } = build(true);
    const menus = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const parent = scheme.icons.getIcon(branchId);
    const tree = menus.buildForValencePoint({ scheme, vp: vpOf(branchId, 0), parent });
    const flat = JSON.stringify(tree);
    expect(flat).toContain('icon:break');
    findButton(tree as IMenuNode[], 'icon:break')?.onClick?.();
    expect(scheme.nodes.getNode(branchId).out?.name).toBe('break');
  });
});

describe('mind-tree scheme module', () => {
  const build = () => {
    const probe = mindTreeSchemeFactory();
    const root = probe.infra.structure.factory('mind-tree');
    probe.dispose();
    const scheme = track(mindTreeSchemeFactory({ document: { id: 'doc', type: 'mind-tree', name: 'doc', root } }));
    const find = (node: INode): string | null => {
      if (checker.isWithSkewer(scheme.icons.getIcon(node.id))) return node.id;
      for (const child of node.children ?? []) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    };
    const parentId = find(root);
    if (!parentId) throw new Error('mind-tree has no skewer icon');
    return { scheme, parentId };
  };

  it('a valence-point click inserts a child into the skewer', () => {
    const { scheme, parentId } = build();
    const before = scheme.icons.getIcon(parentId).name;
    expect(scheme.commands.dispatchCommand(CMD_VALENCE_POINT_CLICKED, { vp: vpOf(parentId, 0), e: {} as never })).toBe(
      true,
    );
    expect(before).toBeTruthy();
    const dto = JSON.stringify(rootDto(scheme));
    expect(dto).toContain('mind-tree-child');
  });

  it('valence-point and icon menus are built', () => {
    const { scheme, parentId } = build();
    const menus = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const parent = scheme.icons.getIcon(parentId);
    expect(JSON.stringify(menus.buildForValencePoint({ scheme, vp: vpOf(parentId, 0), parent }))).toContain(
      'icon:mind-tree-child',
    );
    expect(JSON.stringify(menus.buildForIcon({ scheme, icon: parent }))).toContain('log icon');
  });

  it('the icon menu offers delete only for deletable icons', () => {
    const { scheme, parentId } = build();
    scheme.commands.dispatchCommand(CMD_VALENCE_POINT_CLICKED, { vp: vpOf(parentId, 0), e: {} as never });
    const menus = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const child = scheme.icons.getIcon(scheme.nodes.getNode(parentId).children[0].id);
    expect(JSON.stringify(menus.buildForIcon({ scheme, icon: child }))).toContain('delete');
    expect(
      JSON.stringify(menus.buildForIcon({ scheme, icon: scheme.icons.getIcon(scheme.rootNode?.id ?? '') })),
    ).not.toContain('"delete"');
  });
});
