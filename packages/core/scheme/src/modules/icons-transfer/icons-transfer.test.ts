// oxlint-disable max-lines
import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { insertNode } from '../../actions/insert-node.js';
import { ValencePointsModule } from '../valence-points/valence-points.module.js';
import { TOKEN_VALENCE_POINTS } from '../valence-points/valence-points.service.token.js';
import { IconsTransferModule } from './icons-transfer.module.js';
import { TOKEN_ICONS_TRANSFER_SERVICE } from './icons-transfer.service.token.js';
import type { IconsTransferService } from './icons-transfer.service.js';
import type { IIconMouseDownEvent } from './icons-transfer.types.js';
import { DRAG_START_THRESHOLD, ICONS_DRAGGING_MODE_NAME } from './constants.js';
import { DEFAULT_MODES } from '../../types/toolbar-icon.js';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import { CMD_MOVE_NODES } from '../../scheme/scheme-commands.js';
import type { IMoveNodesCommandParams } from '../../actions/move-nodes.js';
import type { IconStore } from '../../store/icon.store.js';
import type { ValencePointsService } from '../valence-points/valence-points.service.js';

const leftButton = (): IIconMouseDownEvent & { prevented: boolean } => {
  const e = {
    button: 0,
    target: null,
    prevented: false,
    preventDefault() {
      e.prevented = true;
    },
  };
  return e;
};

describe('IconsTransfer module test', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let service: IconsTransferService;
  // oxlint-disable-next-line init-declarations
  let valencePoints: ValencePointsService;
  let bodyId = '';
  /** Three actions on the function-body skewer, then an `if` whose left branch holds one more action. */
  /* oxlint-disable init-declarations */
  let a1: IconStore, a2: IconStore, a3: IconStore, ifIcon: IconStore, ifLeft: IconStore, ifRight: IconStore;
  let inner: IconStore;
  /* oxlint-enable init-declarations */
  let movedParams: IMoveNodesCommandParams[] = [];

  const icon = (id: string) => scheme.icons.getIcon(id);
  const bodyChildrenIds = () => scheme.nodes.getNode(bodyId).children.map((c) => c.id);
  const selectedBlocks = () =>
    scheme.icons.all.filter((i) =>
      resolveService(TOKEN_CSS_CLASSES, scheme.container).getBlockBodyClassName(i.id).includes('selected'),
    );
  const isFilterInstalled = () => valencePoints.visibleValencePoints.length !== valencePoints.allValencePoints.length;
  const vpAt = (parentId: string, index: number) => {
    const vp = valencePoints.allValencePoints.find((p) => p.parentId === parentId && p.index === index);
    if (!vp) throw new Error(`No valence point ${parentId}#${index}`);
    return vp;
  };
  const pressAndDrag = (target: IconStore, to: { x: number; y: number }, e = leftButton()) => {
    scheme.mousePosition.set({ x: target.x, y: target.y });
    service.mouseDown(target, e, scheme);
    scheme.mousePosition.set(to);
    return service.mouseMove(scheme);
  };

  beforeEach(() => {
    movedParams = [];
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new ValencePointsModule(), new IconsTransferModule()],
      document: getTestEmptyDoc(),
    });
    const body = scheme.rootNode?.children[1].id;
    if (!body) throw new Error('Root not set');
    bodyId = body;
    const actions = [0, 1, 2].map((index) => {
      const node = scheme.infra.structure.factory('action');
      insertNode({ index, node, parentId: bodyId }, scheme);
      return icon(node.id);
    });
    [a1, a2, a3] = actions;
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 3, node: ifNode, parentId: bodyId }, scheme);
    ifIcon = icon(ifNode.id);
    const [leftNode, rightNode] = ifNode.children ?? [];
    ifLeft = icon(leftNode.id);
    ifRight = icon(rightNode.id);
    const innerNode = scheme.infra.structure.factory('action2');
    insertNode({ index: 0, node: innerNode, parentId: ifLeft.id }, scheme);
    inner = icon(innerNode.id);
    service = resolveService(TOKEN_ICONS_TRANSFER_SERVICE, scheme.container);
    valencePoints = resolveService(TOKEN_VALENCE_POINTS, scheme.container);
    scheme.commands.registerCommand(
      CMD_MOVE_NODES,
      (params) => {
        movedParams.push(params);
        return false;
      },
      4,
    );
  });

  afterEach(() => {
    scheme.dispose();
  });

  describe('selection in start mode', () => {
    it('click selects one icon, Shift-click on the same skewer selects the contiguous range', () => {
      assert.isTrue(service.iconClicked(a1, scheme));
      assert.deepEqual([...service.selectedIds], [a1.id]);
      assert.deepEqual(
        selectedBlocks().map((i) => i.id),
        [a1.id],
      );

      assert.isTrue(service.iconClicked(a3, scheme, true));
      assert.deepEqual([...service.selectedIds], [a1.id, a2.id, a3.id]);
      assert.deepEqual(
        selectedBlocks().map((i) => i.id),
        [a1.id, a2.id, a3.id],
      );

      // Shift-click shrinks the range back towards the anchor.
      assert.isTrue(service.iconClicked(a2, scheme, true));
      assert.deepEqual([...service.selectedIds], [a1.id, a2.id]);

      // A plain click replaces everything.
      assert.isTrue(service.iconClicked(a3, scheme));
      assert.deepEqual([...service.selectedIds], [a3.id]);
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
    });

    it('Shift-click in another parent list replaces the selection; threads parents stay single-select', () => {
      service.iconClicked(a1, scheme);
      service.iconClicked(a3, scheme, true);
      assert.equal(service.selectedIds.length, 3);
      assert.isTrue(service.iconClicked(inner, scheme, true));
      assert.deepEqual([...service.selectedIds], [inner.id]);

      // `if-child` icons live in the `if`'s threads list: never a range.
      service.iconClicked(ifLeft, scheme);
      assert.isTrue(service.iconClicked(ifRight, scheme, true));
      assert.deepEqual([...service.selectedIds], [ifRight.id]);
    });

    it('a scheme click drops the selection and stays in start mode', () => {
      service.iconClicked(a1, scheme);
      assert.isFalse(service.schemeClicked(scheme));
      assert.deepEqual([...service.selectedIds], []);
      assert.lengthOf(selectedBlocks(), 0);
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
    });

    it('does nothing when the scheme is not editable', () => {
      scheme.isEditing = false;
      assert.isFalse(service.iconClicked(a1, scheme));
      assert.deepEqual([...service.selectedIds], []);
      assert.isFalse(service.mouseDown(a1, leftButton(), scheme));
      scheme.mousePosition.set({ x: 100, y: 100 });
      assert.isFalse(service.mouseMove(scheme));
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
    });

    it('drops the selection when the mode switches away from start/transfer', () => {
      scheme.mode.registerMode({ name: 'some-other-mode' });
      service.iconClicked(a1, scheme);
      scheme.mode.setMode('some-other-mode');
      assert.deepEqual([...service.selectedIds], []);
      assert.lengthOf(selectedBlocks(), 0);
    });
  });

  describe('selection in transfer mode (unchanged)', () => {
    it('a plain second click on the same skewer extends the range, a click elsewhere replaces it', () => {
      scheme.mode.setMode(DEFAULT_MODES.TRANSFER);
      assert.isTrue(isFilterInstalled(), 'transfer mode installs the valence-points filter');
      assert.isTrue(service.iconClicked(a1, scheme));
      assert.deepEqual([...service.selectedIds], [a1.id]);
      assert.isTrue(service.iconClicked(a3, scheme));
      assert.deepEqual([...service.selectedIds], [a1.id, a2.id, a3.id]);
      assert.isTrue(service.iconClicked(inner, scheme));
      assert.deepEqual([...service.selectedIds], [inner.id]);
      // A click on the selected icon itself is not consumed.
      assert.isFalse(service.iconClicked(inner, scheme));

      // A valence-point click moves the selection and drops it.
      assert.isTrue(service.valencePointClicked(vpAt(bodyId, 0), scheme));
      assert.deepEqual(bodyChildrenIds(), [inner.id, a1.id, a2.id, a3.id, ifIcon.id]);
      assert.deepEqual([...service.selectedIds], []);
      assert.equal(scheme.mode.value, DEFAULT_MODES.TRANSFER);

      // A scheme click cancels transfer mode, removing the filter.
      service.iconClicked(a1, scheme);
      service.schemeClicked(scheme);
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
      assert.deepEqual([...service.selectedIds], []);
      assert.isFalse(isFilterInstalled());
    });
  });

  describe('drag gesture', () => {
    it('mouse-down + a move below the threshold does not start a drag', () => {
      const e = leftButton();
      const below = DRAG_START_THRESHOLD / 2;
      assert.isFalse(pressAndDrag(a1, { x: a1.x + below, y: a1.y + below }, e));
      assert.isTrue(e.prevented, 'preventDefault() is called so the browser does not start a text selection');
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
      assert.isFalse(isFilterInstalled());
      assert.isFalse(service.isDragging);
      assert.isFalse(service.mouseUp(scheme), 'mouse-up of a click that never became a drag is not consumed');
      assert.deepEqual([...service.selectedIds], []);
      assert.deepEqual(movedParams, []);
      // The click that follows is not suppressed.
      assert.isTrue(service.iconClicked(a1, scheme));
      assert.deepEqual([...service.selectedIds], [a1.id]);
    });

    it('ignores non-left buttons', () => {
      scheme.mousePosition.set({ x: a1.x, y: a1.y });
      service.mouseDown(a1, { ...leftButton(), button: 2 }, scheme);
      scheme.mousePosition.set({ x: 100, y: 100 });
      assert.isFalse(service.mouseMove(scheme));
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
    });

    it('a move past the threshold enters the dragging mode, filters valence points and touches no node/icon', () => {
      const childrenBefore = bodyChildrenIds();
      const iconsBefore = scheme.icons.all.map((i) => ({ id: i.id, x: i.x, y: i.y }));

      assert.isTrue(pressAndDrag(a2, { x: a2.x + DRAG_START_THRESHOLD, y: a2.y }));
      assert.equal(scheme.mode.value, ICONS_DRAGGING_MODE_NAME);
      assert.isTrue(service.isDragging);
      assert.deepEqual([...service.selectedIds], [a2.id]);

      // Same set `filterValencePoints` yields for this selection in transfer mode: not inside the dragged range
      // (indexes 1..2 of the body), skewer -> skewer only (the `if`'s own hidden threads points never appear).
      const visibleIds = valencePoints.visibleValencePoints.map((vp) => vp.id).toSorted();
      const expectedIds = service
        .filterValencePoints(valencePoints.allValencePoints)
        .map((vp) => vp.id)
        .toSorted();
      assert.deepEqual(visibleIds, expectedIds);
      assert.deepEqual(
        visibleIds,
        [`vp-2-0`, `vp-2-3`, `vp-2-4`, `vp-${ifLeft.id}-0`, `vp-${ifLeft.id}-1`, `vp-${ifRight.id}-0`].toSorted(),
      );
      assert.isTrue(visibleIds.length < valencePoints.allValencePoints.length);

      // Further moves are consumed (no panning) and still mutate nothing.
      scheme.mousePosition.set({ x: 200, y: 200 });
      assert.isTrue(service.mouseMove(scheme));
      assert.deepEqual(bodyChildrenIds(), childrenBefore);
      assert.deepEqual(
        scheme.icons.all.map((i) => ({ id: i.id, x: i.x, y: i.y })),
        iconsBefore,
      );
      assert.deepEqual(movedParams, []);
    });

    it('mouse-up on an allowed valence point moves the nodes exactly as a valence-point click would', () => {
      const target = vpAt(bodyId, 3);
      pressAndDrag(a1, { x: target.x, y: target.y });
      assert.equal(valencePoints.selectedValencePoint?.id, target.id);

      assert.isTrue(service.mouseUp(scheme));
      assert.deepEqual(movedParams, [
        { indexStart: 0, insertIndex: 3, length: 1, newParentId: bodyId, oldParentId: bodyId },
      ]);
      assert.deepEqual(bodyChildrenIds(), [a2.id, a3.id, a1.id, ifIcon.id]);
      assert.deepEqual(
        scheme.icons.getIcon(bodyId).children?.map((i) => i.id),
        [a2.id, a3.id, a1.id, ifIcon.id],
      );
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
      assert.isFalse(service.isDragging);
      assert.deepEqual([...service.selectedIds], []);
      assert.lengthOf(selectedBlocks(), 0);
      assert.isFalse(isFilterInstalled());
    });

    it('drops into another skewer (an if branch)', () => {
      const target = vpAt(ifLeft.id, 1);
      pressAndDrag(a3, { x: target.x, y: target.y });
      assert.isTrue(service.mouseUp(scheme));
      assert.deepEqual(movedParams, [
        { indexStart: 2, insertIndex: 1, length: 1, newParentId: ifLeft.id, oldParentId: bodyId },
      ]);
      assert.deepEqual(bodyChildrenIds(), [a1.id, a2.id, ifIcon.id]);
      assert.deepEqual(
        scheme.nodes.getNode(ifLeft.id).children.map((c) => c.id),
        [inner.id, a3.id],
      );
    });

    it('mouse-up with no valence point in range cancels: nothing moved, mode restored, filter removed, selection kept', () => {
      pressAndDrag(a1, { x: 300, y: 300 });
      assert.isNull(valencePoints.selectedValencePoint);
      assert.isTrue(service.mouseUp(scheme));
      assert.deepEqual(movedParams, []);
      assert.deepEqual(bodyChildrenIds(), [a1.id, a2.id, a3.id, ifIcon.id]);
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
      assert.isFalse(service.isDragging);
      assert.isFalse(isFilterInstalled());
      assert.deepEqual([...service.selectedIds], [a1.id]);
    });

    it('mouse-leave cancels a drag the same way, and a pending one too', () => {
      pressAndDrag(a1, { x: 300, y: 300 });
      assert.equal(scheme.mode.value, ICONS_DRAGGING_MODE_NAME);
      assert.isFalse(service.mouseLeave(scheme));
      assert.deepEqual(movedParams, []);
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
      assert.isFalse(isFilterInstalled());
      assert.isFalse(service.isDragging);
      // Not a drop/cancel-by-mouse-up: the next click is a real click, not a suppressed one.
      assert.isTrue(service.iconClicked(a2, scheme));
      assert.deepEqual([...service.selectedIds], [a2.id]);

      scheme.mousePosition.set({ x: a1.x, y: a1.y });
      service.mouseDown(a1, leftButton(), scheme);
      service.mouseLeave(scheme);
      scheme.mousePosition.set({ x: 300, y: 300 });
      assert.isFalse(service.mouseMove(scheme), 'the pending drag was cleared by mouse-leave');
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
    });

    it('dragging an unselected icon replaces the selection with it', () => {
      service.iconClicked(a1, scheme);
      service.iconClicked(a2, scheme, true);
      assert.deepEqual([...service.selectedIds], [a1.id, a2.id]);
      pressAndDrag(a3, { x: 300, y: 300 });
      assert.deepEqual([...service.selectedIds], [a3.id]);
      assert.deepEqual(
        selectedBlocks().map((i) => i.id),
        [a3.id],
      );
      service.mouseUp(scheme);
    });

    it('dragging a member of a Shift-selected range drags the whole range', () => {
      service.iconClicked(a1, scheme);
      service.iconClicked(a3, scheme, true);
      const target = vpAt(bodyId, 4);
      pressAndDrag(a2, { x: target.x, y: target.y });
      assert.deepEqual([...service.selectedIds], [a1.id, a2.id, a3.id]);
      // The range itself and the point right after it are not drop targets.
      assert.deepEqual(
        valencePoints.visibleValencePoints.map((vp) => vp.id).toSorted(),
        [`vp-2-4`, `vp-${ifLeft.id}-0`, `vp-${ifLeft.id}-1`, `vp-${ifRight.id}-0`].toSorted(),
      );
      assert.isTrue(service.mouseUp(scheme));
      assert.deepEqual(movedParams, [
        { indexStart: 0, insertIndex: 4, length: 3, newParentId: bodyId, oldParentId: bodyId },
      ]);
      assert.deepEqual(bodyChildrenIds(), [ifIcon.id, a1.id, a2.id, a3.id]);
    });

    it('a drag started in transfer mode returns to transfer mode, keeping its filter', () => {
      scheme.mode.setMode(DEFAULT_MODES.TRANSFER);
      service.iconClicked(a1, scheme);
      pressAndDrag(a1, { x: 300, y: 300 });
      assert.equal(scheme.mode.value, ICONS_DRAGGING_MODE_NAME);
      service.mouseUp(scheme);
      assert.equal(scheme.mode.value, DEFAULT_MODES.TRANSFER);
      assert.deepEqual([...service.selectedIds], [a1.id], 'a cancelled drag keeps the selection');
      assert.isTrue(isFilterInstalled(), 'transfer mode owns the filter, so it stays');

      // A drop from transfer mode also returns there.
      const target = vpAt(bodyId, 3);
      pressAndDrag(a1, { x: target.x, y: target.y });
      service.mouseUp(scheme);
      assert.equal(scheme.mode.value, DEFAULT_MODES.TRANSFER);
      assert.deepEqual(bodyChildrenIds(), [a2.id, a3.id, a1.id, ifIcon.id]);
      assert.deepEqual([...service.selectedIds], []);
    });

    it('the click the browser fires after a drag is suppressed once', () => {
      // After a cancelled drag: the icon click that follows neither re-selects nor is passed on.
      pressAndDrag(a1, { x: 300, y: 300 });
      service.mouseUp(scheme);
      assert.isTrue(service.iconClicked(a2, scheme), 'consumed (propagation stopped)');
      assert.deepEqual([...service.selectedIds], [a1.id], 'the suppressed click changed nothing');
      assert.isTrue(service.iconClicked(a2, scheme));
      assert.deepEqual([...service.selectedIds], [a2.id], 'the click after that is a normal click');

      // After a drop: the scheme click that follows does not cancel anything either.
      scheme.mode.setMode(DEFAULT_MODES.TRANSFER);
      const target = vpAt(bodyId, 0);
      pressAndDrag(a3, { x: target.x, y: target.y });
      service.mouseUp(scheme);
      assert.isTrue(service.schemeClicked(scheme));
      assert.equal(scheme.mode.value, DEFAULT_MODES.TRANSFER, 'suppressed: transfer mode was not cancelled');
      assert.isFalse(service.schemeClicked(scheme));
      assert.equal(scheme.mode.value, DEFAULT_MODES.START);
    });

    it('an external mode switch mid-drag ends the drag', () => {
      scheme.mode.registerMode({ name: 'some-other-mode' });
      pressAndDrag(a1, { x: 300, y: 300 });
      scheme.mode.setMode('some-other-mode');
      assert.isFalse(service.isDragging);
      assert.isFalse(isFilterInstalled());
      assert.deepEqual([...service.selectedIds], []);
      assert.isFalse(service.mouseUp(scheme));
      assert.equal(scheme.mode.value, 'some-other-mode');
    });
  });

  describe('ghost contour', () => {
    it('is empty unless dragging', () => {
      assert.deepEqual(service.ghostShapes, []);
      service.iconClicked(a1, scheme);
      assert.deepEqual(service.ghostShapes, []);
    });

    it('holds the selection and all descendants, each at its real position translated by the cursor delta', () => {
      const dx = 50;
      const dy = 70;
      pressAndDrag(ifIcon, { x: ifIcon.x + dx, y: ifIcon.y + dy });
      const shapes = service.ghostShapes;
      // Depth-first: if, left branch, the action inside it, right branch.
      assert.deepEqual(
        shapes.map((s) => s.icon.id),
        [ifIcon.id, ifLeft.id, inner.id, ifRight.id],
      );
      for (const shape of shapes) {
        assert.equal(shape.x, shape.icon.x + dx);
        assert.equal(shape.y, shape.icon.y + dy);
      }

      // Follows the cursor without moving the icons themselves.
      const ifX = ifIcon.x;
      const ifY = ifIcon.y;
      scheme.mousePosition.set({ x: ifIcon.x + 10, y: ifIcon.y - 20 });
      service.mouseMove(scheme);
      assert.equal(service.ghostShapes[0].x, ifX + 10);
      assert.equal(service.ghostShapes[0].y, ifY - 20);
      assert.equal(ifIcon.x, ifX);
      assert.equal(ifIcon.y, ifY);

      service.mouseUp(scheme);
      assert.deepEqual(service.ghostShapes, []);
    });

    it('covers a multi-icon range', () => {
      service.iconClicked(a1, scheme);
      service.iconClicked(a2, scheme, true);
      pressAndDrag(a2, { x: a2.x + 30, y: a2.y });
      assert.deepEqual(
        service.ghostShapes.map((s) => s.icon.id),
        [a1.id, a2.id],
      );
      assert.equal(service.ghostShapes[0].x, a1.x + 30);
      assert.equal(service.ghostShapes[1].y, a2.y);
      service.mouseUp(scheme);
    });
  });
});
