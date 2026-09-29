import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { insertNode } from './insert-node.js';
import { setOutNode } from './set-out-node.js';
import { createNodeStoreFromNode } from '../utils/create-node-store-from-node.js';

describe('setOutNode guard (canHaveOut)', () => {
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

  it('throws when setting a non-null out on the first child of its parent', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    const [firstChild] = scheme.nodes.getNode(ifNode.id).children;
    const outNode = scheme.infra.structure.factory('out');

    assert.throws(() => setOutNode({ id: firstChild.id, outNode }, scheme), /first child/);
    assert.isNull(scheme.nodes.getNode(firstChild.id).out);
  });

  it('does not throw when setting a non-null out on a later child', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    const [, secondChild] = scheme.nodes.getNode(ifNode.id).children;
    const outNode = scheme.infra.structure.factory('out');

    assert.doesNotThrow(() => setOutNode({ id: secondChild.id, outNode }, scheme));
    assert.equal(scheme.nodes.getNode(secondChild.id).out?.name, 'out');
  });

  it('allows clearing an out (outNode: null) on the first child even when it is not allowed to have one', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    const [firstChild] = scheme.nodes.getNode(ifNode.id).children;

    // Simulate an already-broken document (e.g. imported from before this rule existed) by attaching
    // an out directly onto the node store, bypassing setOutNode's own guard entirely.
    const outNode = scheme.infra.structure.factory('out');
    const outStore = createNodeStoreFromNode(outNode, scheme);
    outStore.parent = firstChild;
    firstChild.out = outStore;
    assert.isNotNull(firstChild.out);

    assert.doesNotThrow(() => setOutNode({ id: firstChild.id, outNode: null }, scheme));
    assert.isNull(scheme.nodes.getNode(firstChild.id).out);
  });
});
