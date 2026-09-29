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
import { setData } from '../../actions/set-data.js';

describe('History module grouping test', () => {
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

  it('group: insert + setData + insert → one back reverts all, one forward restores all', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const bodyIcon = scheme.icons.getIcon(bodyNodeId);
    const history = resolveService(TOKEN_HISTORY, scheme.container);

    const first = scheme.infra.structure.factory('action');
    const second = scheme.infra.structure.factory('action');

    history.beginGroup();
    insertNode({ index: 0, node: first, parentId: bodyNodeId }, scheme);
    setData({ id: first.id, data: 'x' }, scheme);
    insertNode({ index: 1, node: second, parentId: bodyNodeId }, scheme);
    history.endGroup();

    assert.equal(bodyIcon.children?.length, 2);
    assert.equal(scheme.nodes.getNode(first.id).data, 'x');
    assert.equal(history.isBackAvailable, true);

    history.back();
    assert.equal(bodyIcon.children?.length, 0);

    history.forward();
    assert.equal(bodyIcon.children?.length, 2);
    assert.equal(scheme.nodes.getNode(first.id).data, 'x');
  });

  it('nested groups flatten into one item', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const bodyIcon = scheme.icons.getIcon(bodyNodeId);
    const history = resolveService(TOKEN_HISTORY, scheme.container);

    history.beginGroup();
    history.beginGroup();
    insertNode({ index: 0, node: scheme.infra.structure.factory('action'), parentId: bodyNodeId }, scheme);
    history.endGroup();
    insertNode({ index: 1, node: scheme.infra.structure.factory('action'), parentId: bodyNodeId }, scheme);
    history.endGroup();

    assert.equal(bodyIcon.children?.length, 2);
    history.back();
    assert.equal(bodyIcon.children?.length, 0);
  });

  it('empty group adds nothing', () => {
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    history.beginGroup();
    history.endGroup();
    assert.equal(history.isBackAvailable, false);
  });

  it('runGrouped closes the group even when fn throws', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const bodyIcon = scheme.icons.getIcon(bodyNodeId);
    const history = resolveService(TOKEN_HISTORY, scheme.container);

    assert.throws(() => {
      history.runGrouped(() => {
        insertNode({ index: 0, node: scheme.infra.structure.factory('action'), parentId: bodyNodeId }, scheme);
        throw new Error('x');
      });
    }, 'x');

    assert.equal(history.isGrouping, false);
    assert.equal(history.isBackAvailable, true);
    history.back();
    assert.equal(bodyIcon.children?.length, 0);
  });

  it('back/forward inside an open group throw', () => {
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    history.beginGroup();
    assert.throws(() => history.back());
    assert.throws(() => history.forward());
  });

  it('endGroup without beginGroup throws', () => {
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    assert.throws(() => history.endGroup());
  });

  it('clear inside a group resets grouping', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const history = resolveService(TOKEN_HISTORY, scheme.container);
    history.beginGroup();
    insertNode({ index: 0, node: scheme.infra.structure.factory('action'), parentId: bodyNodeId }, scheme);
    history.clear();
    assert.equal(history.isGrouping, false);
    assert.equal(history.isBackAvailable, false);
  });
});
