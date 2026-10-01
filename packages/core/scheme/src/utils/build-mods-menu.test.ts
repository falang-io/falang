import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { insertNode } from '../actions/insert-node.js';
import { ContextMenuBuilder } from '../modules/context-menu/context-menu.builder.js';
import type { IContextMenuButton } from '../types/context-menu.js';
import { CMD_INSERT_NODE } from '../scheme/scheme-commands.js';
import type { IInsertNodeCommandParams } from '../actions/insert-node.js';
import { buildModsMenu } from './build-mods-menu.js';

describe('buildModsMenu', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  beforeEach(() => {
    scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    const body = scheme.rootNode?.children[1].id;
    if (!body) throw new Error('Root not set');
    bodyId = body;
  });

  afterEach(() => {
    scheme.dispose();
  });

  const menuFor = (name: string) => {
    const node = scheme.infra.structure.factory(name);
    insertNode({ index: 0, node, parentId: bodyId }, scheme);
    const builder = new ContextMenuBuilder(scheme);
    buildModsMenu({ icon: scheme.icons.getIcon(node.id), builder, scheme });
    return { node, menu: builder.getMenu() };
  };

  it('offers one button per allowed, absent mod kind', () => {
    const { menu } = menuFor('action');
    assert.equal(menu.length, 1);
    assert.include((menu[0] as IContextMenuButton).text, 'mod1');
  });

  it('offers nothing once the mod exists', () => {
    const { node } = menuFor('action');
    insertNode({ index: 0, node: scheme.infra.structure.factory('mod1'), parentId: node.id, slot: 'mods' }, scheme);
    const builder = new ContextMenuBuilder(scheme);
    buildModsMenu({ icon: scheme.icons.getIcon(node.id), builder, scheme });
    assert.equal(builder.getMenu().length, 0);
  });

  it('offers nothing for a host without a policy', () => {
    assert.equal(menuFor('action2').menu.length, 0);
  });

  it('dispatches CMD_INSERT_NODE with slot "mods"', () => {
    const { node, menu } = menuFor('action');
    const seen: IInsertNodeCommandParams[] = [];
    scheme.commands.registerCommand(
      CMD_INSERT_NODE,
      (payload) => {
        seen.push(payload);
        return true;
      },
      4,
    );
    (menu[0] as IContextMenuButton).onClick();
    assert.equal(seen.length, 1);
    assert.equal(seen[0].slot, 'mods');
    assert.equal(seen[0].parentId, node.id);
    assert.equal(seen[0].node.name, 'mod1');
  });
});
