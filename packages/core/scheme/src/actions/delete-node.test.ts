import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { insertNode } from './insert-node.js';
import { setOutNode } from './set-out-node.js';
import { deleteNode } from './delete-node.js';

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
});
