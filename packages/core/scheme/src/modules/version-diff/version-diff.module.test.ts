import { resolveService } from '@falang/di';
import type { INodeChange, INodeTreeDiff } from '@falang/versioning';
import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { insertNode } from '../../actions/insert-node.js';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import type { Scheme } from '../../scheme/scheme.js';
import {
  changeIdsForSide,
  DIFF_ADDED_CLASS,
  DIFF_MODIFIED_CLASS,
  DIFF_MOVED_CLASS,
  DIFF_REMOVED_CLASS,
  VersionDiffModule,
} from './version-diff.module.js';

describe('VersionDiffModule', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;
  /* oxlint-disable init-declarations, sort-vars */
  let addedId: string, modifiedAndMovedId: string, modifiedId: string, removedId: string;
  /* oxlint-enable init-declarations, sort-vars */

  const blockClasses = (id: string): string =>
    resolveService(TOKEN_CSS_CLASSES, scheme.container).getBlockBodyClassName(id);

  const buildDiff = (): INodeTreeDiff => {
    const changes: INodeChange[] = [
      { id: removedId, name: 'action', kind: 'removed', parentId: bodyId, topLevel: true },
      { id: addedId, name: 'action', kind: 'added', parentId: bodyId, topLevel: true },
      {
        id: modifiedId,
        name: 'action',
        kind: 'modified',
        parentId: bodyId,
        topLevel: true,
        fields: [{ path: 'data.foo', oldValue: 1, newValue: 2 }],
      },
      {
        id: modifiedAndMovedId,
        name: 'action',
        kind: 'modified',
        parentId: bodyId,
        topLevel: true,
        fields: [{ path: 'data.foo', oldValue: 1, newValue: 2 }],
        move: {
          from: { parentId: bodyId, slot: 'children', index: 0 },
          to: { parentId: bodyId, slot: 'children', index: 1 },
        },
      },
    ];
    return {
      changes,
      addedIds: [addedId],
      removedIds: [removedId],
      modifiedIds: [modifiedId, modifiedAndMovedId],
      movedIds: [modifiedAndMovedId],
      isEmpty: false,
    };
  };

  beforeEach(() => {
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      document: getTestEmptyDoc(),
    });
    const body = scheme.rootNode?.children[1].id;
    if (!body) throw new Error('Root not set');
    bodyId = body;
    const ids = [0, 1, 2, 3].map((index) => {
      const node = scheme.infra.structure.factory('action');
      insertNode({ index, node, parentId: bodyId }, scheme);
      return node.id;
    });
    [removedId, addedId, modifiedId, modifiedAndMovedId] = ids;
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('left side marks removed + modified + moved, not added', () => {
    const module = new VersionDiffModule({ diff: buildDiff(), side: 'left' });
    module.initialize(scheme);

    assert.include(blockClasses(removedId), DIFF_REMOVED_CLASS);
    assert.include(blockClasses(modifiedId), DIFF_MODIFIED_CLASS);
    assert.include(blockClasses(modifiedAndMovedId), DIFF_MODIFIED_CLASS);
    assert.include(blockClasses(modifiedAndMovedId), DIFF_MOVED_CLASS);
    assert.notInclude(blockClasses(addedId), DIFF_ADDED_CLASS);
    assert.notInclude(blockClasses(removedId), DIFF_ADDED_CLASS);
  });

  it('right side marks added + modified + moved, not removed', () => {
    const module = new VersionDiffModule({ diff: buildDiff(), side: 'right' });
    module.initialize(scheme);

    assert.include(blockClasses(addedId), DIFF_ADDED_CLASS);
    assert.include(blockClasses(modifiedId), DIFF_MODIFIED_CLASS);
    assert.include(blockClasses(modifiedAndMovedId), DIFF_MODIFIED_CLASS);
    assert.include(blockClasses(modifiedAndMovedId), DIFF_MOVED_CLASS);
    assert.notInclude(blockClasses(removedId), DIFF_REMOVED_CLASS);
  });

  it('a modified+moved node gets both classes on both sides', () => {
    const left = new VersionDiffModule({ diff: buildDiff(), side: 'left' });
    left.initialize(scheme);
    const classes = blockClasses(modifiedAndMovedId);
    assert.include(classes, DIFF_MODIFIED_CLASS);
    assert.include(classes, DIFF_MOVED_CLASS);
  });

  it('ignores ids absent from this scheme without throwing', () => {
    const diff: INodeTreeDiff = {
      changes: [{ id: 'ghost-id', name: 'action', kind: 'removed', parentId: null, topLevel: true }],
      addedIds: [],
      removedIds: ['ghost-id'],
      modifiedIds: [],
      movedIds: [],
      isEmpty: false,
    };
    const module = new VersionDiffModule({ diff, side: 'left' });
    assert.doesNotThrow(() => module.initialize(scheme));
  });

  it('dispose clears the classes it applied', () => {
    const module = new VersionDiffModule({ diff: buildDiff(), side: 'left' });
    module.initialize(scheme);
    assert.include(blockClasses(removedId), DIFF_REMOVED_CLASS);

    module.dispose();

    assert.notInclude(blockClasses(removedId), DIFF_REMOVED_CLASS);
    assert.notInclude(blockClasses(modifiedId), DIFF_MODIFIED_CLASS);
    assert.notInclude(blockClasses(modifiedAndMovedId), DIFF_MOVED_CLASS);
  });

  describe('changeIdsForSide', () => {
    it('left gets the removed top-level id plus modified/moved, in diff.changes order', () => {
      assert.deepEqual(changeIdsForSide(buildDiff(), 'left'), [removedId, modifiedId, modifiedAndMovedId]);
    });

    it('right gets the added top-level id plus modified/moved, in diff.changes order', () => {
      assert.deepEqual(changeIdsForSide(buildDiff(), 'right'), [addedId, modifiedId, modifiedAndMovedId]);
    });

    it('excludes a non-topLevel added/removed descendant', () => {
      const diff: INodeTreeDiff = {
        changes: [
          { id: 'top', name: 'action', kind: 'added', parentId: null, topLevel: true },
          { id: 'child', name: 'action', kind: 'added', parentId: 'top', topLevel: false },
        ],
        addedIds: ['top', 'child'],
        removedIds: [],
        modifiedIds: [],
        movedIds: [],
        isEmpty: false,
      };
      assert.deepEqual(changeIdsForSide(diff, 'right'), ['top']);
    });

    it('dedupes an id that appears more than once in diff.changes', () => {
      const diff: INodeTreeDiff = {
        changes: [
          { id: 'x', name: 'action', kind: 'modified', parentId: null, topLevel: true, fields: [] },
          { id: 'x', name: 'action', kind: 'modified', parentId: null, topLevel: true, fields: [] },
        ],
        addedIds: [],
        removedIds: [],
        modifiedIds: ['x'],
        movedIds: [],
        isEmpty: false,
      };
      assert.deepEqual(changeIdsForSide(diff, 'left'), ['x']);
    });
  });
});
