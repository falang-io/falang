import { afterEach, assert, beforeEach, describe, it } from 'vitest';
import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { insertNode } from '../../actions/insert-node.js';
import { setData } from '../../actions/set-data.js';
import { CELL_SIZE, CELL_SIZE_2 } from '../../constants.js';
import { HistoryModule } from '../history/history.module.js';
import { TOKEN_HISTORY } from '../history/history.store.token.js';
import { EditorModule } from '../editor/editor.module.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from '../editor/editor.service.token.js';
import { BlockResizeModule } from './block-resize.module.js';
import { TOKEN_BLOCK_RESIZE_SERVICE } from './block-resize.service.token.js';
import { TOKEN_BLOCK_AUTO_WIDTH } from './block-auto-width.service.token.js';
import { AUTO_WIDTH_MAX, computeAutoBlockWidth } from './block-auto-width.js';

describe('computeAutoBlockWidth', () => {
  it('rounds the content width up to CELL_SIZE_2 and never shrinks', () => {
    assert.isNull(computeAutoBlockWidth(160, 160));
    assert.isNull(computeAutoBlockWidth(160, 161));
    assert.isNull(computeAutoBlockWidth(160, 100));
    assert.equal(computeAutoBlockWidth(160, 170), 192);
    assert.equal(computeAutoBlockWidth(160, 192), 192);
    assert.equal(computeAutoBlockWidth(160, 193), 192 + CELL_SIZE_2);
  });

  it('stops at the maximum', () => {
    assert.equal(computeAutoBlockWidth(160, 5000), AUTO_WIDTH_MAX);
    assert.equal(AUTO_WIDTH_MAX, CELL_SIZE * 40);
    assert.isNull(computeAutoBlockWidth(AUTO_WIDTH_MAX, 5000));
    assert.isNull(computeAutoBlockWidth(AUTO_WIDTH_MAX + 64, 5000));
  });
});

describe('BlockAutoWidthService', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  const build = () => {
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new BlockResizeModule(), new EditorModule()],
      document: getTestEmptyDoc(),
    });
    const id = scheme.rootNode?.children[1].id;
    if (!id) throw new Error('Root not set');
    bodyId = id;
  };

  const service = () => resolveService(TOKEN_BLOCK_AUTO_WIDTH, scheme.container);
  const history = () => resolveService(TOKEN_HISTORY, scheme.container);

  const insertAction = (): string => {
    const node = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node, parentId: bodyId }, scheme);
    return node.id;
  };

  beforeEach(() => build());

  afterEach(() => {
    scheme.dispose();
  });

  it('marks an inserted node pending and leaves a block that fits alone', () => {
    const id = insertAction();
    const icon = scheme.icons.getIcon(id);
    assert.isTrue(service().shouldMeasure(icon));
    service().reportContentWidth(id, icon.blockWidth);
    assert.isFalse(service().isPending(id));
    assert.isUndefined(scheme.nodes.getNode(id).meta.width);
  });

  it('grows a block whose content overflows after an edit, in the same undo step as the edit', () => {
    const id = insertAction();
    const icon = scheme.icons.getIcon(id);
    const startWidth = icon.blockWidth;
    service().reportContentWidth(id, startWidth);

    setData({ id, data: 'a long value' }, scheme);
    assert.isTrue(service().isPending(id));
    service().reportContentWidth(id, startWidth + 10);
    assert.equal(icon.blockWidth, startWidth + CELL_SIZE_2);
    assert.equal(scheme.nodes.getNode(id).meta.width, startWidth + CELL_SIZE_2);

    history().back();
    assert.equal(icon.blockWidth, startWidth);
    assert.notEqual(scheme.nodes.getNode(id).data, 'a long value');
    assert.isFalse(service().isPending(id), 'an undo is not an edit');

    history().forward();
    assert.equal(icon.blockWidth, startWidth + CELL_SIZE_2);
    assert.equal(scheme.nodes.getNode(id).data, 'a long value');
  });

  it('ignores a measurement for a node that is not pending', () => {
    const id = insertAction();
    const icon = scheme.icons.getIcon(id);
    service().reportContentWidth(id, icon.blockWidth);
    service().reportContentWidth(id, icon.blockWidth + 100);
    assert.isUndefined(scheme.nodes.getNode(id).meta.width);
  });

  it('waits while the block is open in the inline editor', () => {
    const id = insertAction();
    const icon = scheme.icons.getIcon(id);
    resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container).editingId = id;
    assert.isFalse(service().shouldMeasure(icon));
    resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container).editingId = null;
    assert.isTrue(service().shouldMeasure(icon));
  });

  it('marks nothing for a document that is just loaded', () => {
    scheme.dispose();
    const document = getTestEmptyDoc();
    const node = getTestInfrastructure().structure.factory('action');
    document.root.children[1].children = [node] as never[];
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new BlockResizeModule()],
      document,
    });
    assert.isNotNull(scheme.nodes.getNodeSafe(node.id));
    assert.isFalse(service().isPending(node.id));
  });

  it('never writes while the scheme is read-only', () => {
    const id = insertAction();
    const icon = scheme.icons.getIcon(id);
    scheme.isEditing = false;
    service().reportContentWidth(id, icon.blockWidth + 100);
    assert.isUndefined(scheme.nodes.getNode(id).meta.width);
  });

  it('does not grow a block that is not resizable', () => {
    const id = insertAction();
    const icon = scheme.icons.getIcon(id);
    Object.defineProperty(icon, 'blockResizable', { get: () => false });
    service().reportContentWidth(id, icon.blockWidth + 100);
    assert.isUndefined(scheme.nodes.getNode(id).meta.width);
  });

  it('can be switched off', () => {
    scheme.dispose();
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new BlockResizeModule({ autoWidth: false })],
      document: getTestEmptyDoc(),
    });
    assert.isFalse(scheme.container.isRegistered(TOKEN_BLOCK_AUTO_WIDTH, true));
  });
});

describe('block width follows meta', () => {
  it('undoing a manual resize restores the width on screen', () => {
    const scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new BlockResizeModule()],
      document: getTestEmptyDoc(),
    });
    try {
      const bodyId = scheme.rootNode?.children[1].id;
      if (!bodyId) throw new Error('Root not set');
      const node = scheme.infra.structure.factory('action');
      insertNode({ index: 0, node, parentId: bodyId }, scheme);
      const icon = scheme.icons.getIcon(node.id);
      const resize = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, scheme.container);
      const startWidth = icon.blockWidth;

      scheme.mousePosition.set({ x: 0, y: 0 });
      resize.startResize(icon, scheme);
      scheme.mousePosition.set({ x: CELL_SIZE_2 * 2, y: 0 });
      resize.updateResize(scheme);
      resize.finishResize(scheme);
      assert.equal(icon.blockWidth, startWidth + CELL_SIZE_2 * 2);

      resolveService(TOKEN_HISTORY, scheme.container).back();
      assert.equal(icon.blockWidth, startWidth);
      resolveService(TOKEN_HISTORY, scheme.container).forward();
      assert.equal(icon.blockWidth, startWidth + CELL_SIZE_2 * 2);
    } finally {
      scheme.dispose();
    }
  });
});
