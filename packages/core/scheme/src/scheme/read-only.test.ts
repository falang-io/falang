import { resolveService } from '@falang/di';
import type React from 'react';
import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { insertNode } from '../actions/insert-node.js';
import { TOKEN_CONTEXT_MENU } from '../modules/context-menu/context-menu.service.token.js';
import { CMD_SHOW_CONTEXT_MENU } from '../modules/context-menu/context-menu.command.js';
import { ContextMenuModule } from '../modules/context-menu/context-menu.module.js';
import { EditorModule } from '../modules/editor/editor.module.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from '../modules/editor/editor.service.token.js';
import { EDITING_INLINE_MODE_NAME } from '../modules/editor/constants.js';
import { DEFAULT_MODES } from '../types/toolbar-icon.js';
import {
  CMD_DELETE_NODE,
  CMD_ICON_CONTEXT_MENU,
  CMD_ICON_MOUSE_CLICK,
  CMD_ICON_MOUSE_DOUBLE_CLICK,
  CMD_INSERT_NODE,
  CMD_SET_DATA,
} from './scheme-commands.js';
import { EVENT_ONCHANGE } from './scheme-events.js';
import { schemeFactory } from './scheme-factory.js';
import type { Scheme } from './scheme.js';

// oxlint-disable no-empty-function
const fakeMouseEvent = () =>
  ({
    stopPropagation: () => {},
    preventDefault: () => {},
  }) as unknown as React.MouseEvent<HTMLDivElement, MouseEvent>;

describe('Read-only scheme', () => {
  describe('mutation commands', () => {
    // oxlint-disable-next-line init-declarations
    let scheme: Scheme;
    // oxlint-disable-next-line init-declarations
    let bodyId: string;
    // oxlint-disable-next-line init-declarations
    let seededNodeId: string;
    let onChangeCount = 0;

    beforeEach(() => {
      onChangeCount = 0;
      scheme = schemeFactory({
        infra: getTestInfrastructure(),
        document: getTestEmptyDoc(),
        readOnly: true,
      });
      const body = scheme.rootNode?.children[1].id;
      if (!body) throw new Error('Root not set');
      bodyId = body;
      // Seed a node by calling the action directly (bypassing the command bus/guard), so there is
      // something for the blocked CMD_DELETE_NODE/CMD_SET_DATA dispatches below to target.
      const node = scheme.infra.structure.factory('action');
      seededNodeId = node.id;
      insertNode({ index: 0, node, parentId: bodyId }, scheme);
      scheme.events.subscribeEvent(EVENT_ONCHANGE, () => {
        onChangeCount += 1;
        return false;
      });
    });

    afterEach(() => {
      scheme.dispose();
    });

    it('blocks CMD_INSERT_NODE and fires no event', () => {
      const node = scheme.infra.structure.factory('action');
      const result = scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: 1, node, parentId: bodyId });
      // The guard stops propagation.
      assert.isTrue(result);
      assert.deepEqual(
        scheme.nodes.getNode(bodyId).children.map((c) => c.id),
        [seededNodeId],
      );
      assert.equal(onChangeCount, 0);
    });

    it('blocks CMD_INSERT_NODE into the mods slot', () => {
      const mod = scheme.infra.structure.factory('mod1');
      const result = scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: mod,
        parentId: seededNodeId,
        slot: 'mods',
      });
      assert.isTrue(result);
      assert.equal(scheme.nodes.getNode(seededNodeId).mods.length, 0);
      assert.equal(onChangeCount, 0);
    });

    it('blocks CMD_DELETE_NODE and fires no event', () => {
      const result = scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: seededNodeId });
      assert.isTrue(result);
      assert.deepEqual(
        scheme.nodes.getNode(bodyId).children.map((c) => c.id),
        [seededNodeId],
      );
      assert.equal(onChangeCount, 0);
    });

    it('blocks CMD_SET_DATA and fires no event', () => {
      const before = scheme.nodes.getNode(seededNodeId).data;
      const result = scheme.commands.dispatchCommand(CMD_SET_DATA, { id: seededNodeId, data: { changed: true } });
      assert.isTrue(result);
      assert.strictEqual(scheme.nodes.getNode(seededNodeId).data, before);
      assert.equal(onChangeCount, 0);
    });
  });

  describe('inline editor', () => {
    // oxlint-disable-next-line init-declarations
    let scheme: Scheme;
    // oxlint-disable-next-line init-declarations
    let nodeId: string;

    beforeEach(() => {
      scheme = schemeFactory({
        infra: getTestInfrastructure(),
        document: getTestEmptyDoc(),
        modules: [new EditorModule()],
        readOnly: true,
      });
      const bodyId = scheme.rootNode?.children[1].id;
      if (!bodyId) throw new Error('Root not set');
      const node = scheme.infra.structure.factory('action');
      nodeId = node.id;
      insertNode({ index: 0, node, parentId: bodyId }, scheme);
    });

    afterEach(() => {
      scheme.dispose();
    });

    it('does not start inline editing on click', () => {
      const icon = scheme.icons.getIcon(nodeId);
      scheme.commands.dispatchCommand(CMD_ICON_MOUSE_CLICK, { e: fakeMouseEvent(), icon });
      const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
      assert.isNull(service.editingId);
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
      assert.notEqual(scheme.mode.value, EDITING_INLINE_MODE_NAME);
    });

    it('does not start inline editing on double click', () => {
      const icon = scheme.icons.getIcon(nodeId);
      scheme.commands.dispatchCommand(CMD_ICON_MOUSE_DOUBLE_CLICK, { e: fakeMouseEvent(), icon });
      const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
      assert.isNull(service.editingId);
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
    });
  });

  describe('context menu', () => {
    // oxlint-disable-next-line init-declarations
    let scheme: Scheme;
    // oxlint-disable-next-line init-declarations
    let nodeId: string;

    beforeEach(() => {
      scheme = schemeFactory({
        infra: getTestInfrastructure(),
        document: getTestEmptyDoc(),
        modules: [new ContextMenuModule()],
        readOnly: true,
      });
      const bodyId = scheme.rootNode?.children[1].id;
      if (!bodyId) throw new Error('Root not set');
      const node = scheme.infra.structure.factory('action');
      nodeId = node.id;
      insertNode({ index: 0, node, parentId: bodyId }, scheme);
      const service = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
      service.registerBuilderForIcon(({ builder }) => {
        builder.addButtons({ group: 'root', items: [{ type: 'button', text: 'menu:delete', onClick: () => {} }] });
      });
    });

    afterEach(() => {
      scheme.dispose();
    });

    it('does not dispatch CMD_SHOW_CONTEXT_MENU for an icon', () => {
      const icon = scheme.icons.getIcon(nodeId);
      let shown = false;
      scheme.commands.registerCommand(CMD_SHOW_CONTEXT_MENU, () => {
        shown = true;
        return true;
      });
      const result = scheme.commands.dispatchCommand(CMD_ICON_CONTEXT_MENU, { e: fakeMouseEvent(), icon });
      assert.isFalse(result);
      assert.isFalse(shown);
    });
  });

  describe('regression: a scheme built without readOnly still edits', () => {
    // oxlint-disable-next-line init-declarations
    let scheme: Scheme;

    afterEach(() => {
      scheme.dispose();
    });

    it('still applies CMD_INSERT_NODE/CMD_DELETE_NODE/CMD_SET_DATA', () => {
      scheme = schemeFactory({
        infra: getTestInfrastructure(),
        document: getTestEmptyDoc(),
      });
      assert.isTrue(scheme.isEditing);
      const bodyId = scheme.rootNode?.children[1].id;
      if (!bodyId) throw new Error('Root not set');
      const node = scheme.infra.structure.factory('action');
      const inserted = scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: 0, node, parentId: bodyId });
      assert.isTrue(inserted);
      assert.deepEqual(
        scheme.nodes.getNode(bodyId).children.map((c) => c.id),
        [node.id],
      );

      const setDataResult = scheme.commands.dispatchCommand(CMD_SET_DATA, { id: node.id, data: { changed: true } });
      assert.isTrue(setDataResult);
      assert.deepEqual(scheme.nodes.getNode(node.id).data, { changed: true });

      const deleted = scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: node.id });
      assert.isTrue(deleted);
      assert.deepEqual(
        scheme.nodes.getNode(bodyId).children.map((c) => c.id),
        [],
      );
    });
  });
});
