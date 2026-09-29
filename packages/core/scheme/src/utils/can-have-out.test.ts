import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { insertNode } from '../actions/insert-node.js';
import { canHaveOut } from './can-have-out.js';

describe('canHaveOut', () => {
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

  it('is false for the first child (children[0]) of its parent, even though its own config has haveOut', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    const [firstChild] = scheme.nodes.getNode(ifNode.id).children;
    assert.isFalse(canHaveOut(scheme, firstChild.id));
  });

  it('is true for a later child of the same parent', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyId }, scheme);
    const [, secondChild] = scheme.nodes.getNode(ifNode.id).children;
    assert.isTrue(canHaveOut(scheme, secondChild.id));
  });

  it('is false for a node kind whose config has no haveOut at all', () => {
    const actionNode = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: actionNode, parentId: bodyId }, scheme);
    assert.isFalse(canHaveOut(scheme, actionNode.id));
  });

  it('is false for a haveOut-configured node when it is the first child of its own parent, outside a branch structure too', () => {
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 0, node: whileNode, parentId: bodyId }, scheme);
    assert.isFalse(canHaveOut(scheme, whileNode.id));
  });

  it('is true for a haveOut-configured node once it is not the first child of its parent', () => {
    const actionNode = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: actionNode, parentId: bodyId }, scheme);
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 1, node: whileNode, parentId: bodyId }, scheme);
    assert.isTrue(canHaveOut(scheme, whileNode.id));
  });
});
