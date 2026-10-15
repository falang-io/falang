import { container, resolveService } from '@falang/di';
import {
  checker,
  CMD_INSERT_NODE,
  CMD_VALENCE_POINT_CLICKED,
  getNodeStoreDto,
  TOKEN_CONTEXT_MENU,
  type IValencePoint,
  type Scheme,
} from '@falang/scheme';
import type { INode } from '@falang/dto';
import { CODE_LANGUAGES } from '@falang/simple-code-dto';
import { afterEach, describe, expect, it } from 'vitest';
import { codeFunctionalSchemeFactory } from './functional.js';

const schemes: Scheme[] = [];
afterEach(() => {
  schemes.splice(0).forEach((s) => s.dispose());
});

const rootDto = (scheme: Scheme) => {
  if (!scheme.rootNode) throw new Error('scheme has no root');
  return getNodeStoreDto(scheme.rootNode, scheme);
};

const vpOf = (parentId: string, index: number) => ({ parentId, index }) as unknown as IValencePoint;

const build = (language: (typeof CODE_LANGUAGES)[number] = 'ts') => {
  const parentContainer = container.createChildContainer();
  const probe = codeFunctionalSchemeFactory({ language, parentContainer });
  const root = probe.infra.structure.factory('code-function');
  probe.dispose();
  const scheme = codeFunctionalSchemeFactory({
    language,
    parentContainer,
    document: { id: 'doc', type: 'simple-code-ts', name: 'doc', root },
  });
  schemes.push(scheme);
  return { scheme, root };
};

const flatten = (menu: unknown) => JSON.stringify(menu);

describe('codeFunctionalSchemeFactory', () => {
  it('builds a scheme for every language and shares one infrastructure per language', () => {
    for (const language of CODE_LANGUAGES) {
      const { scheme } = build(language);
      expect(scheme.infra.structure.configsMap.has('code-function')).toBe(true);
    }
    const a = build('rust').scheme;
    const b = build('rust').scheme;
    expect(a.infra).toBe(b.infra);
    expect(build('cpp').scheme.infra).not.toBe(a.infra);
  });

  it('a valence-point click inserts an action into the function body', () => {
    const { scheme, root } = build();
    const bodyId = root.children?.[1]?.id ?? '';
    expect(scheme.commands.dispatchCommand(CMD_VALENCE_POINT_CLICKED, { vp: vpOf(bodyId, 0), e: {} as never })).toBe(
      true,
    );
    const dto = rootDto(scheme);
    expect(dto.children?.[1]?.children?.map((c: INode) => c.name)).toEqual(['action']);
  });

  it('the valence-point menu offers grouped statements', () => {
    const { scheme, root } = build();
    const bodyId = root.children?.[1]?.id ?? '';
    const menus = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const text = flatten(
      menus.buildForValencePoint({ scheme, vp: vpOf(bodyId, 0), parent: scheme.icons.getIcon(bodyId) }),
    );
    for (const kind of ['action', 'if', 'switch', 'foreach', 'while', 'pseudo-cycle']) {
      expect(text).toContain(`icon:${kind}`);
    }
  });

  it('offers outs only at the end of a non-first branch, one button per kind', () => {
    const { scheme, root } = build();
    const bodyId = root.children?.[1]?.id ?? '';
    const branching = scheme.infra.structure.factory('if');
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: bodyId, index: 0, node: branching });
    const menus = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const firstBranch = branching.children?.[0]?.id ?? '';
    const secondBranch = branching.children?.[1]?.id ?? '';
    expect(checker.isWithSkewer(scheme.icons.getIcon(secondBranch))).toBe(true);
    // buildOutsMenu requires the skewer owner to sit at index >= 1 of its threads parent
    const menuOf = (id: string) =>
      flatten(menus.buildForValencePoint({ scheme, vp: vpOf(id, 0), parent: scheme.icons.getIcon(id) }));
    expect(menuOf(firstBranch)).not.toContain('icon:break');
    const second = menuOf(secondBranch);
    for (const out of ['break', 'continue', 'throw', 'return']) {
      expect(second).toContain(`icon:${out}`);
    }
  });

  it('the icon menu offers delete for a deletable icon only', () => {
    const { scheme, root } = build();
    const bodyId = root.children?.[1]?.id ?? '';
    const action = scheme.infra.structure.factory('action');
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: bodyId, index: 0, node: action });
    const menus = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    expect(flatten(menus.buildForIcon({ scheme, icon: scheme.icons.getIcon(action.id) }))).toContain('menu:delete');
    expect(flatten(menus.buildForIcon({ scheme, icon: scheme.icons.getIcon(root.id) }))).not.toContain('menu:delete');
  });
});
