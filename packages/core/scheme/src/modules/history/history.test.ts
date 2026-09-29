// oxlint-disable max-lines
import { assert, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { resolveService } from '@falang/di';
import { HistoryModule } from './history.module.js';
import { afterEach } from 'node:test';
import { insertNode } from '../../actions/insert-node.js';
import { TOKEN_HISTORY } from './history.store.token.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { runInAction } from 'mobx';
import { deleteNode } from '../../actions/delete-node.js';
import { moveNodes } from '../../actions/move-nodes.js';
import { setData } from '../../actions/set-data.js';
import { setMeta } from '../../actions/set-meta.js';

describe('History module test', () => {
  // oxlint-disable-next-line init-declarations
  let infra: ReturnType<typeof getTestInfrastructure>;
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;

  beforeEach(() => {
    infra = getTestInfrastructure();
    scheme = schemeFactory({
      infra,
      modules: [new HistoryModule()],
      document: getTestEmptyDoc(),
    });
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('insertNode', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const nodeToInsert = scheme.infra.structure.factory('action');
    runInAction(() => {
      insertNode(
        {
          index: 0,
          node: nodeToInsert,
          parentId: bodyNodeId,
        },
        scheme,
      );
    });

    const bodyIcon = scheme.icons.getIcon(bodyNodeId);
    assert.equal(bodyIcon.children?.length, 1);
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    assert.equal(history.isBackAvailable, true);
    assert.equal(history.isForwardAvailable, false);
    history.back();
    assert.equal(bodyIcon.children?.length, 0);
    assert.equal(history.isBackAvailable, false);
    assert.equal(history.isForwardAvailable, true);
    history.forward();
    assert.equal(bodyIcon.children?.length, 1);
    assert.equal(history.isBackAvailable, true);
    assert.equal(history.isForwardAvailable, false);
  });

  it('deleteNode', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const nodeToInsert = scheme.infra.structure.factory('action');
    insertNode(
      {
        index: 0,
        node: nodeToInsert,
        parentId: bodyNodeId,
      },
      scheme,
    );

    const bodyIcon = scheme.icons.getIcon(bodyNodeId);
    const history = resolveService(TOKEN_HISTORY, scheme.container);

    history.clear();

    deleteNode({ id: nodeToInsert.id }, scheme);

    assert.equal(bodyIcon.children?.length, 0);
    assert.equal(history.isBackAvailable, true);
    assert.equal(history.isForwardAvailable, false);

    history.back();
    assert.equal(bodyIcon.children?.length, 1);
    assert.equal(history.isBackAvailable, false);
    assert.equal(history.isForwardAvailable, true);
    history.forward();
    assert.equal(bodyIcon.children?.length, 0);
    assert.equal(history.isBackAvailable, true);
    assert.equal(history.isForwardAvailable, false);
  });

  it('moveNodes', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const ifNode = scheme.infra.structure.factory('if');
    insertNode(
      {
        index: 0,
        node: ifNode,
        parentId: bodyNodeId,
      },
      scheme,
    );

    const leftId = ifNode.children ? ifNode.children[0].id : '';
    const rightId = ifNode.children ? ifNode.children[1].id : '';

    assert.isNotEmpty(leftId);
    assert.isNotEmpty(rightId);

    const actionNode = scheme.infra.structure.factory('if');
    insertNode(
      {
        index: 0,
        node: actionNode,
        parentId: leftId,
      },
      scheme,
    );

    const leftSkewer = scheme.icons.getIcon(leftId);
    const rightSkewer = scheme.icons.getIcon(rightId);
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    history.clear();

    moveNodes(
      {
        indexStart: 0,
        insertIndex: 0,
        length: 1,
        newParentId: rightId,
        oldParentId: leftId,
      },
      scheme,
    );

    assert.equal(leftSkewer.children?.length, 0);
    assert.equal(rightSkewer.children?.length, 1);
    assert.equal(history.isBackAvailable, true);
    assert.equal(history.isForwardAvailable, false);

    history.back();
    assert.equal(leftSkewer.children?.length, 1);
    assert.equal(rightSkewer.children?.length, 0);
    assert.equal(history.isBackAvailable, false);
    assert.equal(history.isForwardAvailable, true);

    history.forward();
    assert.equal(leftSkewer.children?.length, 0);
    assert.equal(rightSkewer.children?.length, 1);
    assert.equal(history.isBackAvailable, true);
    assert.equal(history.isForwardAvailable, false);
  });

  it('moveNodesSameSkewer', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const a1 = scheme.infra.structure.factory('action');
    const a2 = scheme.infra.structure.factory('action');
    const a3 = scheme.infra.structure.factory('action');
    const a4 = scheme.infra.structure.factory('action');
    const a5 = scheme.infra.structure.factory('action');
    const nodes = [a1, a2, a3, a4, a5];
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      insertNode(
        {
          index: 0,
          node: nodes[i],
          parentId: bodyNodeId,
        },
        scheme,
      );
    }

    const nodesIds = nodes.map((n) => n.id);
    const nodesAfterMove = [a3, a4, a1, a2, a5];
    const nodesIdsAfterMove = nodesAfterMove.map((n) => n.id);
    const bodyIcon = scheme.icons.getIcon(bodyNodeId);

    moveNodes(
      {
        indexStart: 0,
        insertIndex: 4,
        length: 2,
        newParentId: bodyNodeId,
        oldParentId: bodyNodeId,
      },
      scheme,
    );

    assert.deepEqual(
      nodesIdsAfterMove,
      bodyIcon.children?.map((c) => c.id),
    );
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    history.back();
    assert.deepEqual(
      nodesIds,
      bodyIcon.children?.map((c) => c.id),
    );
    history.forward();
    assert.deepEqual(
      nodesIdsAfterMove,
      bodyIcon.children?.map((c) => c.id),
    );

    moveNodes(
      {
        indexStart: 2,
        insertIndex: 0,
        length: 2,
        newParentId: bodyNodeId,
        oldParentId: bodyNodeId,
      },
      scheme,
    );

    assert.deepEqual(
      nodesIds,
      bodyIcon.children?.map((c) => c.id),
    );
    history.back();
    assert.deepEqual(
      nodesIdsAfterMove,
      bodyIcon.children?.map((c) => c.id),
    );
    history.forward();
    assert.deepEqual(
      nodesIds,
      bodyIcon.children?.map((c) => c.id),
    );
  });

  describe('moveNodes cross-parent history (undo/redo re-insert index)', () => {
    // oxlint-disable-next-line init-declarations
    let leftId: string;
    // oxlint-disable-next-line init-declarations
    let rightId: string;
    // oxlint-disable-next-line init-declarations
    let a1Id: string;
    // oxlint-disable-next-line init-declarations
    let a2Id: string;
    // oxlint-disable-next-line init-declarations
    let a3Id: string;

    const childrenIds = (parentId: string) => scheme.nodes.getNode(parentId).children.map((c) => c.id);

    beforeEach(() => {
      const bodyNodeId = scheme.rootNode?.children[1].id;
      if (!bodyNodeId) throw new Error('Root not set');
      const ifNode = scheme.infra.structure.factory('if');
      insertNode({ index: 0, node: ifNode, parentId: bodyNodeId }, scheme);
      const [leftNode, rightNode] = ifNode.children ?? [];
      leftId = leftNode.id;
      rightId = rightNode.id;

      const a1 = scheme.infra.structure.factory('action');
      insertNode({ index: 0, node: a1, parentId: leftId }, scheme);
      const a2 = scheme.infra.structure.factory('action');
      insertNode({ index: 1, node: a2, parentId: leftId }, scheme);
      const a3 = scheme.infra.structure.factory('action');
      insertNode({ index: 2, node: a3, parentId: leftId }, scheme);
      a1Id = a1.id;
      a2Id = a2.id;
      a3Id = a3.id;

      resolveService(TOKEN_HISTORY, scheme.container).clear();
    });

    it('undoes a cross-parent move of the first node of a 3-node parent', () => {
      const history = resolveService(TOKEN_HISTORY, scheme.container);

      moveNodes({ indexStart: 0, insertIndex: 0, length: 1, newParentId: rightId, oldParentId: leftId }, scheme);
      assert.deepEqual(childrenIds(leftId), [a2Id, a3Id]);
      assert.deepEqual(childrenIds(rightId), [a1Id]);

      history.back();
      assert.deepEqual(childrenIds(leftId), [a1Id, a2Id, a3Id]);
      assert.deepEqual(childrenIds(rightId), []);

      history.forward();
      assert.deepEqual(childrenIds(leftId), [a2Id, a3Id]);
      assert.deepEqual(childrenIds(rightId), [a1Id]);
    });

    it('undoes a cross-parent move of a middle node', () => {
      const history = resolveService(TOKEN_HISTORY, scheme.container);

      moveNodes({ indexStart: 1, insertIndex: 0, length: 1, newParentId: rightId, oldParentId: leftId }, scheme);
      assert.deepEqual(childrenIds(leftId), [a1Id, a3Id]);
      assert.deepEqual(childrenIds(rightId), [a2Id]);

      history.back();
      assert.deepEqual(childrenIds(leftId), [a1Id, a2Id, a3Id]);
      assert.deepEqual(childrenIds(rightId), []);

      history.forward();
      assert.deepEqual(childrenIds(leftId), [a1Id, a3Id]);
      assert.deepEqual(childrenIds(rightId), [a2Id]);
    });

    it('undoes a cross-parent move of a range of nodes', () => {
      const history = resolveService(TOKEN_HISTORY, scheme.container);

      moveNodes({ indexStart: 0, insertIndex: 0, length: 2, newParentId: rightId, oldParentId: leftId }, scheme);
      assert.deepEqual(childrenIds(leftId), [a3Id]);
      assert.deepEqual(childrenIds(rightId), [a1Id, a2Id]);

      history.back();
      assert.deepEqual(childrenIds(leftId), [a1Id, a2Id, a3Id]);
      assert.deepEqual(childrenIds(rightId), []);

      history.forward();
      assert.deepEqual(childrenIds(leftId), [a3Id]);
      assert.deepEqual(childrenIds(rightId), [a1Id, a2Id]);
    });
  });

  describe('moveNodes same-parent history (regression, must keep passing)', () => {
    // oxlint-disable-next-line init-declarations
    let bodyNodeId: string;
    // oxlint-disable-next-line init-declarations
    let a1Id: string;
    // oxlint-disable-next-line init-declarations
    let a2Id: string;
    // oxlint-disable-next-line init-declarations
    let a3Id: string;

    const childrenIds = (parentId: string) => scheme.nodes.getNode(parentId).children.map((c) => c.id);

    beforeEach(() => {
      const body = scheme.rootNode?.children[1].id;
      if (!body) throw new Error('Root not set');
      bodyNodeId = body;

      const a1 = scheme.infra.structure.factory('action');
      insertNode({ index: 0, node: a1, parentId: bodyNodeId }, scheme);
      const a2 = scheme.infra.structure.factory('action');
      insertNode({ index: 1, node: a2, parentId: bodyNodeId }, scheme);
      const a3 = scheme.infra.structure.factory('action');
      insertNode({ index: 2, node: a3, parentId: bodyNodeId }, scheme);
      a1Id = a1.id;
      a2Id = a2.id;
      a3Id = a3.id;

      resolveService(TOKEN_HISTORY, scheme.container).clear();
    });

    it('undoes/redoes a same-parent forward move (index 0 -> insertIndex 3)', () => {
      const history = resolveService(TOKEN_HISTORY, scheme.container);

      moveNodes({ indexStart: 0, insertIndex: 3, length: 1, newParentId: bodyNodeId, oldParentId: bodyNodeId }, scheme);
      assert.deepEqual(childrenIds(bodyNodeId), [a2Id, a3Id, a1Id]);

      history.back();
      assert.deepEqual(childrenIds(bodyNodeId), [a1Id, a2Id, a3Id]);

      history.forward();
      assert.deepEqual(childrenIds(bodyNodeId), [a2Id, a3Id, a1Id]);
    });

    it('undoes/redoes a same-parent backward move (index 2 -> insertIndex 0)', () => {
      const history = resolveService(TOKEN_HISTORY, scheme.container);

      moveNodes({ indexStart: 2, insertIndex: 0, length: 1, newParentId: bodyNodeId, oldParentId: bodyNodeId }, scheme);
      assert.deepEqual(childrenIds(bodyNodeId), [a3Id, a1Id, a2Id]);

      history.back();
      assert.deepEqual(childrenIds(bodyNodeId), [a1Id, a2Id, a3Id]);

      history.forward();
      assert.deepEqual(childrenIds(bodyNodeId), [a3Id, a1Id, a2Id]);
    });
  });

  it('setData', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const bodyNode = scheme.nodes.getNode(bodyNodeId);
    setData(
      {
        id: bodyNodeId,
        data: 'data',
      },
      scheme,
    );
    assert.equal(bodyNode.data, 'data');
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    history.back();
    assert.equal(bodyNode.data, '');
    history.forward();
    assert.equal(bodyNode.data, 'data');
  });

  it('setMeta', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const bodyNode = scheme.nodes.getNode(bodyNodeId);
    const meta1 = { a: 1 };
    const meta2 = { a: 2 };
    setMeta(
      {
        id: bodyNodeId,
        meta: meta1,
      },
      scheme,
    );
    setMeta(
      {
        id: bodyNodeId,
        meta: meta2,
      },
      scheme,
    );
    assert.deepEqual(bodyNode.meta, meta2);
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    history.back();
    assert.deepEqual(bodyNode.meta, meta1);
    history.forward();
    assert.deepEqual(bodyNode.meta, meta2);
  });
});
