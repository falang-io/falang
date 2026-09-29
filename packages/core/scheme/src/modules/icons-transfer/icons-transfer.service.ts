import { action, computed, makeObservable, observable } from 'mobx';
import type { Scheme } from '../../scheme/scheme.js';
import type { IconStore } from '../../store/icon.store.js';
import { checker } from '../../checker.js';
import { DEFAULT_MODES } from '../../types/toolbar-icon.js';
import type { IIconWithList } from '../../types/icon-list.js';
import { resolveService } from '@falang/di';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import type { IValencePoint } from '../../types/valence-point-item.js';
import { TOKEN_VALENCE_POINTS } from '../valence-points/valence-points.service.token.js';
import { CMD_MOVE_NODES } from '../../scheme/scheme-commands.js';
import { DRAG_START_THRESHOLD, ICONS_DRAGGING_MODE_NAME, VALENCE_POINTS_FILTER_ALIAS } from './constants.js';
import type { IActiveDrag, IGhostShape, IIconMouseDownEvent, IPendingDrag } from './icons-transfer.types.js';
import { isEditableTarget } from './is-editable-target.js';

export class IconsTransferService {
  @observable.ref private selectedIconsIds: string[] = [];
  @observable private startIndex = 0;
  @observable private length = 0;
  @observable private parentId = '';
  @observable private isSkewer = false;
  /** The icon a plain (non-Shift) click selected — Shift-clicks extend the range from it. */
  private anchorIconId: string | null = null;
  @observable.ref private pendingDrag: IPendingDrag | null = null;
  @observable.ref private activeDrag: IActiveDrag | null = null;
  /** Set on drop/cancel: the browser still fires a `click` after a drag, and that one must be a no-op. */
  private suppressNextClick = false;
  private readonly scheme: Scheme;

  constructor(scheme: Scheme) {
    this.scheme = scheme;
    makeObservable(this);
  }

  get isDragging(): boolean {
    return this.activeDrag !== null;
  }

  get selectedIds(): readonly string[] {
    return this.selectedIconsIds;
  }

  /** `CMD_ICON_MOUSE_CLICK`. `true` = consumed (the handler then stops propagation so the scheme click doesn't drop it). */
  @action iconClicked(icon: IconStore, scheme: Scheme, shiftKey = false): boolean {
    if (this.consumeSuppressedClick()) return true;
    if (scheme.mode.value === DEFAULT_MODES.TRANSFER) return this.iconClickedInTransferMode(icon, scheme);
    if (scheme.mode.value === DEFAULT_MODES.START) return this.iconClickedInStartMode(icon, scheme, shiftKey);
    return false;
  }

  private iconClickedInTransferMode(icon: IconStore, scheme: Scheme): boolean {
    const parent = icon.parent;
    if (!checker.isWithList(parent)) return false;
    const selectedIds = this.selectedIconsIds;
    const canExtend = selectedIds.length === 1 && !checker.isWithThreads(parent) && this.parentId === parent.id;
    if (!canExtend) {
      this.setSelectedIds([icon.id], parent, scheme);
      return true;
    }
    if (selectedIds[0] === icon.id) return false;
    return this.selectRange(selectedIds[0], icon.id, parent, scheme);
  }

  private iconClickedInStartMode(icon: IconStore, scheme: Scheme, shiftKey: boolean): boolean {
    if (!scheme.isEditing) return false;
    const parent = icon.parent;
    if (!checker.isWithList(parent)) return false;
    const anchorId = this.anchorIconId;
    const canExtend =
      shiftKey &&
      anchorId !== null &&
      this.selectedIconsIds.length > 0 &&
      this.parentId === parent.id &&
      !checker.isWithThreads(parent);
    if (canExtend && this.selectRange(anchorId, icon.id, parent, scheme)) return true;
    this.setSelectedIds([icon.id], parent, scheme);
    return true;
  }

  /** Selects the contiguous range between two icons of the same list (the anchor stays the range's anchor). */
  private selectRange(anchorId: string, clickedId: string, parent: IIconWithList, scheme: Scheme): boolean {
    const clickedIndex = parent.list.iconsIds.indexOf(clickedId);
    const anchorIndex = parent.list.iconsIds.indexOf(anchorId);
    if (clickedIndex === -1 || anchorIndex === -1) return false;
    const startIndex = Math.min(clickedIndex, anchorIndex);
    const endIndex = Math.max(clickedIndex, anchorIndex);
    const ids = parent.list.iconsIds.slice(startIndex, endIndex + 1);
    this.setSelectedIds(ids, parent, scheme, anchorId);
    return true;
  }

  @action private setSelectedIds(ids: string[], parent: IIconWithList, scheme: Scheme, anchorId?: string) {
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    cssClasses.removeClassFromAllBlocks('selected');
    if (ids.length === 0) return;
    const startIndex = parent.list.iconsIds.indexOf(ids[0]);
    this.selectedIconsIds = ids;
    this.startIndex = startIndex;
    this.length = ids.length;
    this.parentId = parent.id;
    this.isSkewer = checker.isWithSkewer(parent);
    this.anchorIconId = anchorId ?? ids[0];
    for (const id of ids) {
      cssClasses.addBlockClass(id, 'selected');
    }
  }

  /** Handles `CMD_SCHEME_MOUSE_CLICK`. Returns `true` only when the click was the one suppressed after a drag. */
  @action schemeClicked(scheme: Scheme): boolean {
    if (this.consumeSuppressedClick()) return true;
    if (scheme.mode.value === DEFAULT_MODES.START) {
      this.dropSelection(scheme);
      return false;
    }
    this.cancel(scheme);
    return false;
  }

  private consumeSuppressedClick(): boolean {
    if (!this.suppressNextClick) return false;
    this.suppressNextClick = false;
    return true;
  }

  /** Called on `EVENT_MODE_CHANGED` with `newMode === transfer` (not when returning from a drag). */
  @action start(scheme: Scheme) {
    if (scheme.mode.value !== DEFAULT_MODES.TRANSFER) return;
    this.dropSelection(scheme);
    this.addValencePointsFilter(scheme);
  }

  /**
   * `EVENT_MODE_CHANGED`. Entering transfer mode installs the filter; leaving `start`/`transfer` for anything but the
   * dragging mode (e.g. inline editing) drops the selection so stale `selected` borders never survive a mode switch.
   */
  @action modeChanged(oldMode: string, newMode: string, scheme: Scheme) {
    if (newMode === ICONS_DRAGGING_MODE_NAME) return;
    if (oldMode === ICONS_DRAGGING_MODE_NAME) {
      // A normal drop/cancel already ran `finishDrag()`; an external mode switch mid-drag ends the drag here instead.
      if (this.activeDrag) this.finishDrag(scheme, false);
      if (newMode === DEFAULT_MODES.START || newMode === DEFAULT_MODES.TRANSFER) return;
      this.removeValencePointsFilter(scheme);
      this.dropSelection(scheme);
      return;
    }
    this.pendingDrag = null;
    if (newMode === DEFAULT_MODES.TRANSFER) {
      this.start(scheme);
      return;
    }
    // Leaving transfer mode by any route other than `cancel()` (e.g. the mode selector) — its filter goes with it.
    if (oldMode === DEFAULT_MODES.TRANSFER) this.removeValencePointsFilter(scheme);
    this.dropSelection(scheme);
  }

  @action cancel(scheme: Scheme): boolean {
    if (scheme.mode.value !== DEFAULT_MODES.TRANSFER) return false;
    this.dropSelection(scheme);
    scheme.mode.setMode(DEFAULT_MODES.START);
    this.removeValencePointsFilter(scheme);
    return true;
  }

  @action dropSelection(scheme: Scheme): boolean {
    this.selectedIconsIds = [];
    this.anchorIconId = null;
    resolveService(TOKEN_CSS_CLASSES, scheme.container).removeClassFromAllBlocks('selected');
    return true;
  }

  filterValencePoints(points: IValencePoint[]): IValencePoint[] {
    const startIndex = this.startIndex;
    const endIndex = this.startIndex + this.length;
    if (this.selectedIconsIds.length === 0) return [];
    return points.filter((vp) => {
      if (this.isSkewer) {
        if (vp.type !== 'in-skewer') return false;
        if (vp.parentId !== this.parentId) return true;
      } else if (vp.parentId !== this.parentId) return false;
      return vp.index < startIndex || vp.index > endIndex;
    });
  }

  @action valencePointClicked(vp: IValencePoint, scheme: Scheme): boolean {
    if (scheme.mode.value !== DEFAULT_MODES.TRANSFER) return false;
    if (this.selectedIconsIds.length > 0) this.moveSelectionTo(vp, scheme);
    return true;
  }

  private moveSelectionTo(vp: IValencePoint, scheme: Scheme) {
    scheme.commands.dispatchCommand(CMD_MOVE_NODES, {
      indexStart: this.startIndex,
      insertIndex: vp.index,
      length: this.length,
      newParentId: vp.parentId,
      oldParentId: this.parentId,
    });
    this.dropSelection(scheme);
  }

  /** `CMD_ICON_MOUSE_DOWN`: records a pending drag. Never enters the dragging mode or consumes the event (a click must work). */
  @action mouseDown(icon: IconStore, e: IIconMouseDownEvent, scheme: Scheme): boolean {
    if (e.button !== 0 || !scheme.isEditing) return false;
    const mode = scheme.mode.value;
    if (mode !== DEFAULT_MODES.START && mode !== DEFAULT_MODES.TRANSFER) return false;
    if (!checker.isWithList(icon.parent)) return false;
    if (!isEditableTarget(e.target)) e.preventDefault();
    const { x: startX, y: startY } = scheme.mousePosition;
    this.pendingDrag = { iconId: icon.id, startX, startY, returnMode: mode };
    return false;
  }

  /** `CMD_SCHEME_MOUSE_MOVE`. `true` while dragging, so the canvas doesn't pan. */
  @action mouseMove(scheme: Scheme): boolean {
    if (this.activeDrag) return true;
    const pending = this.pendingDrag;
    if (!pending) return false;
    const dx = scheme.mousePosition.x - pending.startX;
    const dy = scheme.mousePosition.y - pending.startY;
    if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD) return false;
    this.pendingDrag = null;
    const icon = scheme.icons.getIconSafe(pending.iconId);
    const parent = icon?.parent;
    if (!icon || !checker.isWithList(parent)) return false;
    if (!this.selectedIconsIds.includes(icon.id)) this.setSelectedIds([icon.id], parent, scheme);
    this.activeDrag = { startX: pending.startX, startY: pending.startY, returnMode: pending.returnMode };
    scheme.mode.setMode(ICONS_DRAGGING_MODE_NAME);
    this.addValencePointsFilter(scheme);
    return true;
  }

  /** `CMD_SCHEME_MOUSE_UP`: drops onto the valence point under the cursor (if any) and ends the drag. */
  @action mouseUp(scheme: Scheme): boolean {
    if (this.pendingDrag) {
      this.pendingDrag = null;
      return false;
    }
    if (!this.activeDrag) return false;
    const vp = resolveService(TOKEN_VALENCE_POINTS, scheme.container).selectedValencePoint;
    this.finishDrag(scheme, true);
    if (vp && this.selectedIconsIds.length > 0) this.moveSelectionTo(vp, scheme);
    return true;
  }

  /** `CMD_SCHEME_MOUSE_LEAVE`: cancels a pending or active drag so the scheme can't get stuck dragging. */
  @action mouseLeave(scheme: Scheme): boolean {
    this.pendingDrag = null;
    if (this.activeDrag) this.finishDrag(scheme, false);
    return false;
  }

  /** Ends the drag: restores the mode it started from and removes the filter unless that mode owns it (transfer). */
  private finishDrag(scheme: Scheme, suppressClick: boolean) {
    const drag = this.activeDrag;
    if (!drag) return;
    this.activeDrag = null;
    if (drag.returnMode !== DEFAULT_MODES.TRANSFER) this.removeValencePointsFilter(scheme);
    if (scheme.mode.value === ICONS_DRAGGING_MODE_NAME) scheme.mode.setMode(drag.returnMode);
    this.suppressNextClick = suppressClick;
  }

  private addValencePointsFilter(scheme: Scheme) {
    resolveService(TOKEN_VALENCE_POINTS, scheme.container).addValencePointsFilter(
      VALENCE_POINTS_FILTER_ALIAS,
      (items) => this.filterValencePoints(items),
    );
  }

  private removeValencePointsFilter(scheme: Scheme) {
    resolveService(TOKEN_VALENCE_POINTS, scheme.container).removeValencePointsFilter(VALENCE_POINTS_FILTER_ALIAS);
  }

  /**
   * The ghost contour: every selected icon plus all of its descendants (depth-first), each at its real position
   * translated by the cursor delta (icons keep their real `x`/`y` during the drag). Empty unless dragging.
   */
  @computed get ghostShapes(): IGhostShape[] {
    const drag = this.activeDrag;
    if (!drag) return [];
    const { scheme } = this;
    const dx = scheme.mousePosition.x - drag.startX;
    const dy = scheme.mousePosition.y - drag.startY;
    const shapes: IGhostShape[] = [];
    const visit = (icon: IconStore) => {
      shapes.push({ icon, x: icon.x + dx, y: icon.y + dy });
      if (checker.isWithChildren(icon)) icon.children.forEach(visit);
    };
    for (const id of this.selectedIconsIds) {
      const icon = scheme.icons.getIconSafe(id);
      if (icon) visit(icon);
    }
    return shapes;
  }
}
