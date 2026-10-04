import { assert, describe, it } from 'vitest';
import type { INode } from '@falang/dto';
import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { insertNode } from '../../actions/insert-node.js';
import { deleteNode } from '../../actions/delete-node.js';
import { moveNodes } from '../../actions/move-nodes.js';
import { setData } from '../../actions/set-data.js';
import { setMeta } from '../../actions/set-meta.js';
import { getDto } from '../../utils/get-dto.js';
import { HistoryModule } from './history.module.js';
import { TOKEN_HISTORY } from './history.store.token.js';

const build = (document: ReturnType<typeof getTestEmptyDoc>, store?: ReturnType<typeof createStore>) =>
  schemeFactory({ infra: getTestInfrastructure(), modules: [new HistoryModule({ store })], document });
const createStore = (scheme: Scheme) => resolveService(TOKEN_HISTORY, scheme.container);
const dtoOf = (scheme: Scheme) => {
  if (!scheme.rootNode) throw new Error('Root not set');
  return getDto(scheme.rootNode.id, scheme);
};
const bodyId = (scheme: Scheme): string => {
  const id = scheme.rootNode?.children[1].id;
  if (!id) throw new Error('Root not set');
  return id;
};

/** `getDto` omits falsy data and empty children (see CLAUDE.md); the strict test stack wants them back. */
const normalize = (node: INode): never =>
  ({
    ...node,
    data: node.data ?? '',
    children: node.children?.map(normalize) ?? null,
  }) as never;

/** Rebuilds the scheme from its own DTO, moving the history store over, and disposes the old scheme. */
const rebuild = (scheme: Scheme): Scheme => {
  const store = createStore(scheme);
  const next = build({ ...getTestEmptyDoc(), root: normalize(dtoOf(scheme)) }, store);
  scheme.dispose();
  return next;
};

describe('history store survives a scheme rebuild', () => {
  it('insert / setData / setMeta / delete / move undo and redo on the new scheme', () => {
    let scheme = build(getTestEmptyDoc());
    const parent = bodyId(scheme);
    const a = scheme.infra.structure.factory('action');
    const b = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: a, parentId: parent }, scheme);
    insertNode({ index: 1, node: b, parentId: parent }, scheme);
    setData({ id: a.id, data: 'x' }, scheme);
    setMeta({ id: a.id, meta: { m: 1 } }, scheme);
    const afterEdits = dtoOf(scheme);
    moveNodes({ indexStart: 0, insertIndex: 2, length: 1, newParentId: parent, oldParentId: parent }, scheme);
    const afterMove = dtoOf(scheme);
    deleteNode({ id: b.id }, scheme);
    const afterDelete = dtoOf(scheme);
    const store = createStore(scheme);

    scheme = rebuild(scheme);
    assert.strictEqual(createStore(scheme), store);
    assert.deepEqual(dtoOf(scheme), afterDelete);

    store.back();
    assert.deepEqual(dtoOf(scheme), afterMove);
    store.back();
    assert.deepEqual(dtoOf(scheme), afterEdits);
    store.back();
    store.back();
    assert.notExists(scheme.nodes.getNode(a.id).meta?.m);
    store.forward();
    store.forward();
    assert.deepEqual(dtoOf(scheme), afterEdits);
    store.forward();
    store.forward();
    assert.deepEqual(dtoOf(scheme), afterDelete);
    scheme.dispose();
  });

  it('records no history while replaying and new edits after the rebuild are recorded', () => {
    let scheme = build(getTestEmptyDoc());
    const parent = bodyId(scheme);
    const a = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: a, parentId: parent }, scheme);
    const store = createStore(scheme);
    scheme = rebuild(scheme);
    store.back();
    assert.isFalse(store.isReplaying);
    assert.isFalse(store.isBackAvailable);
    assert.isTrue(store.isForwardAvailable);
    const c = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: c, parentId: parent }, scheme);
    assert.isTrue(store.isBackAvailable);
    assert.isFalse(store.isForwardAvailable);
    store.back();
    assert.equal(scheme.nodes.getNode(parent).children.length, 0);
    scheme.dispose();
  });

  it('a group recorded before the rebuild undoes as one step', () => {
    let scheme = build(getTestEmptyDoc());
    const parent = bodyId(scheme);
    const empty = dtoOf(scheme);
    const store = createStore(scheme);
    store.runGrouped(() => {
      insertNode({ index: 0, node: scheme.infra.structure.factory('action'), parentId: parent }, scheme);
      insertNode({ index: 1, node: scheme.infra.structure.factory('action'), parentId: parent }, scheme);
    });
    scheme = rebuild(scheme);
    store.back();
    assert.deepEqual(dtoOf(scheme), empty);
    scheme.dispose();
  });

  it('the old scheme disposal does not clear the store; moving it during an open group throws', () => {
    const scheme = build(getTestEmptyDoc());
    const store = createStore(scheme);
    insertNode({ index: 0, node: scheme.infra.structure.factory('action'), parentId: bodyId(scheme) }, scheme);
    store.beginGroup();
    assert.throws(() => store.attach(scheme));
    store.endGroup();
    const next = rebuild(scheme);
    assert.isTrue(store.isBackAvailable);
    next.dispose();
  });
});
