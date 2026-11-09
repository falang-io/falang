import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveService } from '@falang/di';
import { runInAction } from 'mobx';
import type { Scheme } from '../../scheme/scheme.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { insertNode } from '../../actions/insert-node.js';
import type { BlockEditorStore } from '../../store/block-editor.store.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { EditorModule } from './editor.module.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from './editor.service.token.js';
import { commitInlineEdit } from './editor.service.js';

describe('EditorService.commitEdit', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let nodeId: string;

  beforeEach(() => {
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new EditorModule()],
      document: getTestEmptyDoc(),
    });
    const bodyId = scheme.rootNode?.children[1].id;
    if (!bodyId) throw new Error('Root not set');
    const node = scheme.infra.structure.factory('action');
    nodeId = node.id;
    runInAction(() => insertNode({ index: 0, node, parentId: bodyId }, scheme));
  });

  afterEach(() => {
    scheme.dispose();
  });

  const startFakeEdit = (data: unknown): { disposed: () => boolean } => {
    const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
    let disposed = false;
    const store = { getData: () => data, dispose: () => (disposed = true) } as unknown as BlockEditorStore;
    runInAction(() => {
      service.editingId = nodeId;
      service.editingStore = store;
    });
    return { disposed: () => disposed };
  };

  it('writes the open editor data into the node and keeps the editor open', () => {
    const edit = startFakeEdit('x = 1');
    expect(commitInlineEdit(scheme)).toBe(true);
    expect(scheme.nodes.getNode(nodeId).data).toBe('x = 1');
    const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
    expect(service.editingId).toBe(nodeId);
    expect(edit.disposed()).toBe(false);
  });

  it('does nothing when the data is unchanged or nothing is edited', () => {
    expect(commitInlineEdit(scheme)).toBe(false);
    startFakeEdit(scheme.nodes.getNode(nodeId).data);
    expect(commitInlineEdit(scheme)).toBe(false);
  });

  it('is a no-op for a scheme without the editor module', () => {
    const bare = schemeFactory({ infra: getTestInfrastructure(), modules: [], document: getTestEmptyDoc() });
    expect(commitInlineEdit(bare)).toBe(false);
    bare.dispose();
  });
});
