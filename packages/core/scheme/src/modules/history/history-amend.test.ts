import { afterEach, assert, beforeEach, describe, it } from 'vitest';
import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { insertNode } from '../../actions/insert-node.js';
import { setData } from '../../actions/set-data.js';
import { setMeta } from '../../actions/set-meta.js';
import { HistoryModule } from './history.module.js';
import { TOKEN_HISTORY } from './history.store.token.js';
import type { HistoryStore } from './history.store.js';

describe('HistoryStore.amendLast', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let history: HistoryStore;
  // oxlint-disable-next-line init-declarations
  let nodeId: string;

  beforeEach(() => {
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new HistoryModule()],
      document: getTestEmptyDoc(),
    });
    history = resolveService(TOKEN_HISTORY, scheme.container);
    const bodyId = scheme.rootNode?.children[1].id;
    if (!bodyId) throw new Error('Root not set');
    const node = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node, parentId: bodyId }, scheme);
    nodeId = node.id;
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('attaches an amending change to the latest step: one back reverts both, one forward restores both', () => {
    setData({ id: nodeId, data: 'long' }, scheme);
    history.runAmending(() => setMeta({ id: nodeId, meta: { width: 320 } }, scheme));

    history.back();
    assert.notEqual(scheme.nodes.getNode(nodeId).data, 'long');
    assert.isUndefined(scheme.nodes.getNode(nodeId).meta.width);

    history.forward();
    assert.equal(scheme.nodes.getNode(nodeId).data, 'long');
    assert.equal(scheme.nodes.getNode(nodeId).meta.width, 320);

    // The insert is still a step of its own.
    history.back();
    history.back();
    assert.isNull(scheme.nodes.getNodeSafe(nodeId));
  });

  it('joins an open group', () => {
    history.runGrouped(() => {
      setData({ id: nodeId, data: 'x' }, scheme);
      history.runAmending(() => setMeta({ id: nodeId, meta: { width: 320 } }, scheme));
    });
    history.back();
    assert.isUndefined(scheme.nodes.getNode(nodeId).meta.width);
    assert.notEqual(scheme.nodes.getNode(nodeId).data, 'x');
    history.back();
    assert.isNull(scheme.nodes.getNodeSafe(nodeId));
  });

  it('becomes a step of its own after an undo instead of touching the redo target', () => {
    setData({ id: nodeId, data: 'x' }, scheme);
    history.back();
    history.runAmending(() => setMeta({ id: nodeId, meta: { width: 320 } }, scheme));

    history.back();
    assert.isUndefined(scheme.nodes.getNode(nodeId).meta.width);
    assert.notEqual(scheme.nodes.getNode(nodeId).data, 'x');
    assert.isNotNull(scheme.nodes.getNodeSafe(nodeId));
  });
});
