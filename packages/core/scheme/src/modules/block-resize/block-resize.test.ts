import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { resolveService } from '@falang/di';
import { insertNode } from '../../actions/insert-node.js';
import { BlockResizeModule } from './block-resize.module.js';
import { TOKEN_BLOCK_RESIZE_SERVICE } from './block-resize.service.token.js';
import { ICON_RESIZING_MODE_NAME } from './constants.js';
import { CELL_SIZE_2 } from '../../constants.js';
import { DEFAULT_MODES } from '../../types/toolbar-icon.js';
import { EditorModule } from '../editor/editor.module.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from '../editor/editor.service.token.js';

describe('BlockResize module test', () => {
  // oxlint-disable-next-line init-declarations
  let infra: ReturnType<typeof getTestInfrastructure>;
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;

  beforeEach(() => {
    infra = getTestInfrastructure();
    scheme = schemeFactory({
      infra,
      modules: [new BlockResizeModule()],
      document: getTestEmptyDoc(),
    });
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('shows the handle only on the last hovered resizable icon', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const actionNode = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: actionNode, parentId: bodyNodeId }, scheme);
    const actionIcon = scheme.icons.getIcon(actionNode.id);
    const service = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, scheme.container);

    assert.isNull(service.getHandleIcon(scheme));
    service.setHoveredIcon(actionIcon, scheme);
    assert.equal(service.getHandleIcon(scheme)?.id, actionIcon.id);
  });

  it('resizes in CELL_SIZE_2 steps while dragging and persists the width on mouse up', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const actionNode = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: actionNode, parentId: bodyNodeId }, scheme);
    const actionIcon = scheme.icons.getIcon(actionNode.id);
    const service = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, scheme.container);
    const startWidth = actionIcon.blockWidth;

    scheme.mousePosition.set({ x: 0, y: 0 });
    service.startResize(actionIcon, scheme);
    assert.equal(scheme.mode.value, ICON_RESIZING_MODE_NAME);

    scheme.mousePosition.set({ x: CELL_SIZE_2 * 2.4, y: 0 });
    service.updateResize(scheme);
    assert.equal(actionIcon.blockWidth, startWidth + CELL_SIZE_2 * 2);

    service.finishResize(scheme);
    assert.equal(scheme.mode.value, DEFAULT_MODES.START);
    assert.equal(scheme.nodes.getNode(actionNode.id).meta?.width, startWidth + CELL_SIZE_2 * 2);
  });

  it('does not let hover switch to another icon while actively resizing', () => {
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const action1 = scheme.infra.structure.factory('action');
    const action2 = scheme.infra.structure.factory('action2');
    insertNode({ index: 0, node: action1, parentId: bodyNodeId }, scheme);
    insertNode({ index: 1, node: action2, parentId: bodyNodeId }, scheme);
    const icon1 = scheme.icons.getIcon(action1.id);
    const icon2 = scheme.icons.getIcon(action2.id);
    const service = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, scheme.container);

    service.startResize(icon1, scheme);
    service.setHoveredIcon(icon2, scheme);
    assert.equal(service.getHandleIcon(scheme)?.id, icon1.id);
  });

  it('hides the handle for an icon that is currently being inline-edited', () => {
    const editingScheme = schemeFactory({
      infra,
      modules: [new BlockResizeModule(), new EditorModule()],
      document: getTestEmptyDoc(),
    });
    try {
      const bodyNodeId = editingScheme.rootNode?.children[1].id;
      if (!bodyNodeId) throw new Error('Root not set');
      const actionNode = editingScheme.infra.structure.factory('action');
      insertNode({ index: 0, node: actionNode, parentId: bodyNodeId }, editingScheme);
      const actionIcon = editingScheme.icons.getIcon(actionNode.id);
      const service = resolveService(TOKEN_BLOCK_RESIZE_SERVICE, editingScheme.container);
      const editorService = resolveService(TOKEN_INLINE_EDITOR_SERVICE, editingScheme.container);

      service.setHoveredIcon(actionIcon, editingScheme);
      assert.equal(service.getHandleIcon(editingScheme)?.id, actionIcon.id);

      editorService.editingId = actionIcon.id;
      assert.isNull(service.getHandleIcon(editingScheme));

      editorService.editingId = null;
      assert.equal(service.getHandleIcon(editingScheme)?.id, actionIcon.id);
    } finally {
      editingScheme.dispose();
    }
  });
});
