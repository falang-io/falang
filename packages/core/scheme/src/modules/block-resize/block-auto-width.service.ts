import { action, makeObservable, observable } from 'mobx';
import { resolveService } from '@falang/di';
import type { Scheme } from '../../scheme/scheme.js';
import type { IconStore } from '../../store/icon.store.js';
import type { NodeStore } from '../../store/node.store.js';
import { EVENT_DATA_UPDATED, EVENT_NODE_INSERTED } from '../../scheme/scheme-events.js';
import { CMD_SET_META } from '../../scheme/scheme-commands.js';
import { resolveEditorType } from '../../types/block-config.js';
import { TOKEN_HISTORY } from '../history/history.store.token.js';
import type { HistoryStore } from '../history/history.store.js';
import { TOKEN_INLINE_EDITOR_SERVICE } from '../editor/editor.service.token.js';
import { computeAutoBlockWidth } from './block-auto-width.js';

/**
 * Grows a block whose content no longer fits after its data changed (an edit, an agent's write) or after it was
 * inserted. The block view measures its content once the node is pending (`shouldMeasure`) and reports the width
 * (`reportContentWidth`); a block that overflows gets a wider `meta.width`, attached to the latest undo step so one
 * undo reverts the edit together with the widening. A scheme just loaded or rebuilt fires no events, so opening a
 * document never changes it.
 */
export class BlockAutoWidthService {
  private readonly scheme: Scheme;
  private readonly pending = observable.set<string>();
  private readonly unsubscribe: (() => void)[] = [];

  constructor(scheme: Scheme) {
    this.scheme = scheme;
    makeObservable(this);
  }

  start(): void {
    this.unsubscribe.push(
      this.scheme.events.subscribeEvent(EVENT_DATA_UPDATED, ({ node }) => {
        this.markPending(node);
        return false;
      }),
      this.scheme.events.subscribeEvent(EVENT_NODE_INSERTED, ({ node }) => {
        this.markPending(node, true);
        return false;
      }),
    );
  }

  dispose(): void {
    this.unsubscribe.splice(0).forEach((fn) => fn());
    this.pending.clear();
  }

  isPending(id: string): boolean {
    return this.pending.has(id);
  }

  /** Whether the view should measure `icon` now — pending and not open in an inline editor (whose own layout differs). */
  shouldMeasure(icon: IconStore): boolean {
    return this.pending.has(icon.id) && !this.isInlineEditing(icon);
  }

  /** The block view's measured content width (`scrollWidth` of the block container) for a pending icon. */
  @action reportContentWidth(id: string, contentWidth: number): void {
    if (!this.pending.has(id)) return;
    this.pending.delete(id);
    const scheme = this.scheme;
    if (!scheme.isEditing) return;
    const icon = scheme.icons.getIconSafe(id);
    const node = scheme.nodes.getNodeSafe(id);
    if (!icon || !node || !icon.blockResizable) return;
    const width = computeAutoBlockWidth(icon.blockWidth, contentWidth);
    if (width === null) return;
    const apply = () => scheme.commands.dispatchCommand(CMD_SET_META, { id, meta: { ...node.meta, width } });
    const history = this.getHistory();
    if (history) history.runAmending(apply);
    else apply();
  }

  @action private markPending(node: NodeStore, withDescendants = false): void {
    // An undo/redo restores the meta it recorded; widening then would add a step and drop the redo stack.
    if (this.getHistory()?.isReplaying) return;
    this.pending.add(node.id);
    if (!withDescendants) return;
    node.children.forEach((child) => this.markPending(child, true));
    node.mods.forEach((mod) => this.markPending(mod, true));
    if (node.out) this.markPending(node.out, true);
  }

  private getHistory(): HistoryStore | null {
    const container = this.scheme.container;
    return container.isRegistered(TOKEN_HISTORY, true) ? resolveService(TOKEN_HISTORY, container) : null;
  }

  private isInlineEditing(icon: IconStore): boolean {
    const container = this.scheme.container;
    if (!container.isRegistered(TOKEN_INLINE_EDITOR_SERVICE, true)) return false;
    const editor = resolveService(TOKEN_INLINE_EDITOR_SERVICE, container);
    if (editor.editingId !== icon.id) return false;
    return resolveEditorType(icon.config.block.editor, editor.editingStore) !== 'sidebar';
  }
}
