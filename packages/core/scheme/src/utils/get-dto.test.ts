import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { insertNode } from '../actions/insert-node.js';
import { setOutNode } from '../actions/set-out-node.js';
import { setMeta } from '../actions/set-meta.js';
import { getDto, getNodeStoreDto } from './get-dto.js';

describe('getDto / getNodeStoreDto', () => {
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

  it('surfaces the icon-computed trueOnRight into the DTO even though the node itself has no meta', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);

    // `NodesStack.factory` always sets `meta` to an (empty) object, never `undefined` — the
    // interesting fact this test is about is that `getDto` fills it in from the icon regardless.
    assert.deepEqual(scheme.nodes.getNode(ifNode.id).meta, {});

    const dto = getDto(ifNode.id, scheme);
    assert.deepEqual(dto.meta, { trueOnRight: false });
  });

  it('surfaces the icon-computed trueIsMain into the DTO even though the node itself has no meta', () => {
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 0, node: whileNode, parentId: bodyId }, scheme);

    assert.deepEqual(scheme.nodes.getNode(whileNode.id).meta, {});

    const dto = getDto(whileNode.id, scheme);
    assert.deepEqual(dto.meta, { trueIsMain: false });
  });

  it('lets an explicit node.meta value win over the icon-computed default', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    setMeta({ id: ifNode.id, meta: { trueOnRight: true } }, scheme);

    const dto = getDto(ifNode.id, scheme);
    assert.deepEqual(dto.meta, { trueOnRight: true });
  });

  it('does not add outLevel for a level-1 out node (plain break/continue, not labeled)', () => {
    // `function-body` has no `haveOut` in its own config (see `canHaveOut`/`setOutNode`'s guard), so
    // the out is set on a `while` node instead, placed after a dummy sibling so it isn't `children[0]`
    // of `bodyId` either.
    const dummy = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: dummy, parentId: bodyId }, scheme);
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 1, node: whileNode, parentId: bodyId }, scheme);

    const outNode = scheme.infra.structure.factory('out');
    setOutNode({ id: whileNode.id, outNode }, scheme);
    const outNodeId = scheme.nodes.getNode(whileNode.id).out?.id;
    if (!outNodeId) throw new Error('Out node was not set on container');

    const dto = getDto(outNodeId, scheme);
    assert.isUndefined(dto.meta);
  });

  it('keeps an explicit outLevel set on the node itself', () => {
    const dummy = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: dummy, parentId: bodyId }, scheme);
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 1, node: whileNode, parentId: bodyId }, scheme);

    const outNode = scheme.infra.structure.factory('out');
    setOutNode({ id: whileNode.id, outNode }, scheme);
    const outNodeId = scheme.nodes.getNode(whileNode.id).out?.id;
    if (!outNodeId) throw new Error('Out node was not set on container');
    setMeta({ id: outNodeId, meta: { outLevel: 2 } }, scheme);

    const dto = getDto(outNodeId, scheme);
    assert.deepEqual(dto.meta, { outLevel: 2 });
  });

  it('omits the meta field entirely for a node with no meta and no icon-computed meta at all', () => {
    const actionNode = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: actionNode, parentId: bodyId }, scheme);

    const dto = getDto(actionNode.id, scheme);
    assert.isUndefined(dto.meta);
  });

  it('falls back to plain store.meta (no icon-computed defaults) when called without a scheme', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    const store = scheme.nodes.getNode(ifNode.id);

    const dto = getNodeStoreDto(store);
    assert.isUndefined(dto.meta);
  });
});
