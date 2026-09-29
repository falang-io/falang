import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { insertNode } from '../actions/insert-node.js';
import { ContextMenuBuilder } from '../modules/context-menu/context-menu.builder.js';
import type { IContextMenuButton } from '../types/context-menu.js';
import { buildSwitchTrueFalseMenu } from './build-switch-true-false-menu.js';

describe('buildSwitchTrueFalseMenu', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  beforeEach(() => {
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      document: getTestEmptyDoc(),
    });
    const body = scheme.rootNode?.children[1].id;
    if (!body) throw new Error('Root not set');
    bodyId = body;
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('toggles meta.trueOnRight for an if icon, preserving other meta keys', () => {
    const ifNode = scheme.infra.structure.factory('if', { width: 300 });
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    const icon = scheme.icons.getIcon(ifNode.id);
    const builder = new ContextMenuBuilder(scheme);

    buildSwitchTrueFalseMenu({ icon, builder, scheme });

    const menu = builder.getMenu();
    assert.equal(menu.length, 1);
    (menu[0] as IContextMenuButton).onClick();

    assert.deepEqual(scheme.nodes.getNode(ifNode.id).meta, { width: 300, trueOnRight: true });
  });

  it('double toggle returns to the original value', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    const icon = scheme.icons.getIcon(ifNode.id);

    const builder1 = new ContextMenuBuilder(scheme);
    buildSwitchTrueFalseMenu({ icon, builder: builder1, scheme });
    (builder1.getMenu()[0] as IContextMenuButton).onClick();
    assert.equal(scheme.nodes.getNode(ifNode.id).meta.trueOnRight, true);

    const builder2 = new ContextMenuBuilder(scheme);
    buildSwitchTrueFalseMenu({ icon, builder: builder2, scheme });
    (builder2.getMenu()[0] as IContextMenuButton).onClick();
    assert.equal(scheme.nodes.getNode(ifNode.id).meta.trueOnRight, false);
  });

  it('toggles meta.trueIsMain for a while icon', () => {
    const whileNode = scheme.infra.structure.factory('while', { width: 250 });
    insertNode({ index: 0, node: whileNode, parentId: bodyId }, scheme);
    const icon = scheme.icons.getIcon(whileNode.id);
    const builder = new ContextMenuBuilder(scheme);

    buildSwitchTrueFalseMenu({ icon, builder, scheme });
    (builder.getMenu()[0] as IContextMenuButton).onClick();

    assert.deepEqual(scheme.nodes.getNode(whileNode.id).meta, { width: 250, trueIsMain: true });
  });

  it('does not add a menu item for a non-if/while icon', () => {
    const actionNode = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: actionNode, parentId: bodyId }, scheme);
    const icon = scheme.icons.getIcon(actionNode.id);
    const builder = new ContextMenuBuilder(scheme);

    buildSwitchTrueFalseMenu({ icon, builder, scheme });

    assert.equal(builder.getMenu().length, 0);
  });
});
