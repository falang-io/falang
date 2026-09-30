import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { insertNode } from './insert-node.js';
import { setOutNode } from './set-out-node.js';
import { deleteNode } from './delete-node.js';
import { EVENT_NODE_DELETED, type IEventDataNodeDeleted } from '../scheme/scheme-events.js';

describe('deleteNode action', () => {
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

  it('removes a regular child node from its parent children list', () => {
    const node = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node, parentId: bodyId }, scheme);

    deleteNode({ id: node.id }, scheme);

    assert.isNull(scheme.nodes.getNodeSafe(node.id));
    assert.deepEqual(
      scheme.nodes.getNode(bodyId).children.map((c) => c.id),
      [],
    );
  });

  it('throws for an unknown node id', () => {
    assert.throws(() => deleteNode({ id: 'unknown-id' }, scheme));
  });

  it('removes a node that is set as its parent out node instead of throwing', () => {
    // `function-body` has no `haveOut` in its own config, so it can never have an `out` set on it
    // (see `canHaveOut`/`setOutNode`'s guard) — use a `while` node as the out-owning container
    // instead, placed after a dummy sibling so it isn't `children[0]` of `bodyId` either.
    const dummy = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: dummy, parentId: bodyId }, scheme);
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 1, node: whileNode, parentId: bodyId }, scheme);

    const outNode = scheme.infra.structure.factory('out');
    setOutNode({ id: whileNode.id, outNode }, scheme);

    const containerNode = scheme.nodes.getNode(whileNode.id);
    const outNodeId = containerNode.out?.id;
    if (!outNodeId) throw new Error('Out node was not set on container');
    assert.isNotNull(scheme.nodes.getNodeSafe(outNodeId));

    assert.doesNotThrow(() => deleteNode({ id: outNodeId }, scheme));

    assert.isNull(containerNode.out);
    assert.isNull(scheme.nodes.getNodeSafe(outNodeId));
  });

  it('leaves the sibling children untouched when deleting the parent out node', () => {
    const dummy = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: dummy, parentId: bodyId }, scheme);
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 1, node: whileNode, parentId: bodyId }, scheme);

    const sibling = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: sibling, parentId: whileNode.id }, scheme);

    const outNode = scheme.infra.structure.factory('out');
    setOutNode({ id: whileNode.id, outNode }, scheme);
    const containerNode = scheme.nodes.getNode(whileNode.id);
    const outNodeId = containerNode.out?.id;
    if (!outNodeId) throw new Error('Out node was not set on container');

    deleteNode({ id: outNodeId }, scheme);

    assert.deepEqual(
      containerNode.children.map((c) => c.id),
      [sibling.id],
    );
  });

  describe('mods', () => {
    const insertHostWithMod = () => {
      const host = scheme.infra.structure.factory('action');
      insertNode({ index: 0, node: host, parentId: bodyId }, scheme);
      const mod = scheme.infra.structure.factory('mod1');
      (mod as { data: unknown }).data = 42;
      insertNode({ index: 0, node: mod, parentId: host.id, slot: 'mods' }, scheme);
      return { host, mod };
    };
    const recordDeleted = (): IEventDataNodeDeleted[] => {
      const events: IEventDataNodeDeleted[] = [];
      scheme.events.subscribeEvent(EVENT_NODE_DELETED, (e) => {
        events.push(e);
        return false;
      });
      return events;
    };

    it('removes a mod from parent.mods with slot "mods" and its full DTO', () => {
      const { host, mod } = insertHostWithMod();
      const events = recordDeleted();
      deleteNode({ id: mod.id }, scheme);

      assert.equal(scheme.nodes.getNode(host.id).mods.length, 0);
      assert.equal(scheme.nodes.getNode(host.id).children.length, 0);
      assert.isNull(scheme.nodes.getNodeSafe(mod.id));
      assert.isNull(scheme.icons.getIconSafe(mod.id));
      assert.equal(scheme.icons.getIcon(host.id).mods.length, 0);
      assert.equal(events.length, 1);
      assert.equal(events[0].slot, 'mods');
      assert.equal(events[0].index, 0);
      assert.equal(events[0].parentId, host.id);
      assert.equal(events[0].node.data, 42);
    });

    it('removes a host together with its mod and keeps the mod in the event DTO', () => {
      const { host, mod } = insertHostWithMod();
      const events = recordDeleted();
      deleteNode({ id: host.id }, scheme);

      assert.isNull(scheme.nodes.getNodeSafe(host.id));
      assert.isNull(scheme.nodes.getNodeSafe(mod.id));
      assert.isNull(scheme.icons.getIconSafe(host.id));
      assert.isNull(scheme.icons.getIconSafe(mod.id));
      assert.equal(events[0].slot, 'children');
      assert.deepEqual(
        events[0].node.mods?.map((m) => m.id),
        [mod.id],
      );
    });

    it('reports slot "children" for a regular child', () => {
      const node = scheme.infra.structure.factory('action2');
      insertNode({ index: 0, node, parentId: bodyId }, scheme);
      const events = recordDeleted();
      deleteNode({ id: node.id }, scheme);
      assert.equal(events[0].slot, 'children');
    });

    it('throws when the node is in none of the parent lists', () => {
      const node = scheme.infra.structure.factory('action2');
      insertNode({ index: 0, node, parentId: bodyId }, scheme);
      scheme.nodes.getNode(bodyId).children.clear();
      assert.throws(() => deleteNode({ id: node.id }, scheme));
    });
  });
});
