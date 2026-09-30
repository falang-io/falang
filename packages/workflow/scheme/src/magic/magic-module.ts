// oxlint-disable max-lines
import { resolveService } from '@falang/di';
import {
  CMD_DELETE_NODE,
  CMD_ICON_MOUSE_DOUBLE_CLICK,
  CMD_INSERT_NODE,
  CMD_MOVE_NODES,
  CMD_SET_DATA,
  CMD_SET_META,
  CMD_SET_OUT,
  DEFAULT_MODES,
  EDITING_INLINE_MODE_NAME,
  EVENT_DATA_UPDATED,
  EVENT_NODE_DELETED,
  EVENT_NODE_INSERTED,
  TOKEN_CONTEXT_MENU,
  TOKEN_HISTORY,
  TOKEN_I18N,
  TOKEN_INLINE_EDITOR_SERVICE,
  type IModule,
  type NodeStore,
  type Scheme,
  type SchemeCommand,
} from '@falang/scheme';
import { MAGIC_NAME, type TMagicData } from '@falang/workflow-dto';
import { registerWorkflowSchemeLocales } from '../locales/workflow-scheme-locales.js';
import { TOKEN_MAGIC_HOST, type IMagicHost } from './magic-host.js';

const readSpell = (node: NodeStore): string => (node.data as Partial<TMagicData> | null)?.spell ?? '';

/**
 * Main-scheme behaviour of the magic node (ADR 0046 (private)):
 *
 * - double-click opens the host's popup editor (priority 3, above the editor's own inline-edit handler);
 * - a magic node just inserted through `CMD_INSERT_NODE` starts inline editing at once; ending that first
 *   edit with an empty spell (Enter on nothing, or Escape — the spell editor returns the old data then)
 *   swaps the node for a plain `action` in place;
 * - an inline `spell` edit that changes the text calls `host.onSpellCommitted`;
 * - any mutation command that touches a node strictly inside a magic node sets `meta.handEdited` on it
 *   (unless the host says it is filling it), in the **same undo step** as the triggering edit: the
 *   mutation commands are intercepted at priority 4 and re-dispatched together with the `setMeta` inside
 *   one `HistoryStore` group (so it works for undo/redo, which replays the two history items together);
 * - context menu on a magic icon: Edit steps…, Regenerate, Unwrap.
 *
 * Everything host-related is optional (`TOKEN_MAGIC_HOST`); without a host only the fresh-node/unwrap/
 * handEdited behaviour remains.
 */
export class MagicModule implements IModule {
  private freshIds = new Set<string>();
  private pendingFresh: string | null = null;
  private pendingCommit: { id: string; prev: string; next: string } | null = null;
  private reentrant = false;
  private disposers: (() => void)[] = [];

  register(scheme: Scheme) {
    registerWorkflowSchemeLocales(scheme);
  }

  initialize(scheme: Scheme) {
    this.registerDoubleClick(scheme);
    this.registerFreshInsertAndEdit(scheme);
    this.registerHandEdited(scheme);
    this.registerContextMenu(scheme);
  }

  dispose() {
    this.disposers.forEach((d) => d());
    this.disposers = [];
    this.freshIds.clear();
  }

  // --- helpers -----------------------------------------------------------------------------------

  private host(scheme: Scheme): IMagicHost | null {
    return scheme.container.isRegistered(TOKEN_MAGIC_HOST, true)
      ? resolveService(TOKEN_MAGIC_HOST, scheme.container)
      : null;
  }

  private history(scheme: Scheme) {
    return scheme.container.isRegistered(TOKEN_HISTORY, true) ? resolveService(TOKEN_HISTORY, scheme.container) : null;
  }

  private runGrouped<T>(scheme: Scheme, fn: () => T): T {
    const history = this.history(scheme);
    return history ? history.runGrouped(fn) : fn();
  }

  /** The magic node `start` itself (when `includeSelf`) or strictly above it. */
  private magicAbove(scheme: Scheme, startId: string, includeSelf: boolean): NodeStore | null {
    let node = scheme.nodes.getNodeSafe(startId);
    if (node && !includeSelf) node = node.parent;
    while (node) {
      if (node.name === MAGIC_NAME) return node;
      node = node.parent;
    }
    return null;
  }

  private onCommand<P>(scheme: Scheme, command: SchemeCommand<P>, listener: (p: P) => boolean, priority: 0 | 3 | 4) {
    this.disposers.push(scheme.commands.registerCommand(command, listener, priority));
  }

  // --- double click ------------------------------------------------------------------------------

  private registerDoubleClick(scheme: Scheme) {
    this.onCommand(
      scheme,
      CMD_ICON_MOUSE_DOUBLE_CLICK,
      ({ e, icon }) => {
        if (!scheme.isEditing || icon.name !== MAGIC_NAME) return false;
        const host = this.host(scheme);
        if (!host) return false;
        const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
        if (service.editingId === icon.id) {
          // Typing into a freshly inserted node: leave it alone. Otherwise drop the inline edit unsaved.
          if (this.freshIds.has(icon.id)) return false;
          service.stopEdit(scheme, false);
          scheme.mode.setMode(DEFAULT_MODES.START);
        }
        e.stopPropagation();
        host.openEditor(icon.id);
        return true;
      },
      3,
    );
  }

  // --- fresh insert, inline edit end -------------------------------------------------------------

  private registerFreshInsertAndEdit(scheme: Scheme) {
    this.onCommand(
      scheme,
      CMD_INSERT_NODE,
      ({ node }) => {
        if (
          !this.reentrant &&
          node.name === MAGIC_NAME &&
          ((node.data as Partial<TMagicData> | null)?.spell ?? '') === ''
        ) {
          this.pendingFresh = node.id;
        }
        return false;
      },
      4,
    );
    const offInserted = scheme.events.subscribeEvent(EVENT_NODE_INSERTED, ({ node }) => {
      if (this.pendingFresh !== node.id) return false;
      this.pendingFresh = null;
      if (!scheme.isEditing) return false;
      const icon = scheme.icons.getIconSafe(node.id);
      if (!icon) return false;
      this.freshIds.add(node.id);
      const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
      service.stopEdit(scheme, true);
      if (service.setIconForEdit(icon, scheme)) scheme.mode.setMode(EDITING_INLINE_MODE_NAME);
      return false;
    });
    const offDeleted = scheme.events.subscribeEvent(EVENT_NODE_DELETED, ({ node }) => {
      this.freshIds.delete(node.id);
      return false;
    });
    this.onCommand(
      scheme,
      CMD_SET_DATA,
      ({ id, data }) => {
        const service = resolveService(TOKEN_INLINE_EDITOR_SERVICE, scheme.container);
        const node = scheme.nodes.getNodeSafe(id);
        if (!node || node.name !== MAGIC_NAME || service.editingId !== id) return false;
        const prev = readSpell(node);
        const next = (data as Partial<TMagicData> | null)?.spell ?? '';
        const wasFresh = this.freshIds.delete(id);
        if (wasFresh && next.trim() === '') {
          this.replaceWithAction(scheme, node);
          return true;
        }
        if (next.trim() === '' || next === prev) return true;
        this.pendingCommit = { id, prev, next };
        return false;
      },
      4,
    );
    const offUpdated = scheme.events.subscribeEvent(EVENT_DATA_UPDATED, ({ node }) => {
      const commit = this.pendingCommit;
      if (!commit || commit.id !== node.id) return false;
      this.pendingCommit = null;
      this.host(scheme)?.onSpellCommitted(commit.id, commit.prev, commit.next);
      return false;
    });
    this.disposers.push(offInserted, offDeleted, offUpdated);
  }

  private replaceWithAction(scheme: Scheme, magic: NodeStore) {
    const parent = magic.parent;
    if (!parent) return;
    const index = parent.children.findIndex((child) => child.id === magic.id);
    const action = scheme.infra.structure.factory('action');
    this.runGrouped(scheme, () => {
      scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: magic.id });
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId: parent.id, index, node: action });
    });
  }

  // --- meta.handEdited ---------------------------------------------------------------------------

  private needsFlag(scheme: Scheme, magic: NodeStore | null): magic is NodeStore {
    if (!magic || magic.meta?.handEdited === true) return false;
    return !this.host(scheme)?.isFilling?.(magic.id);
  }

  private registerHandEdited(scheme: Scheme) {
    const intercept = <P>(command: SchemeCommand<P>, magicsOf: (payload: P) => (NodeStore | null)[]) => {
      this.onCommand(
        scheme,
        command,
        (payload) => {
          if (this.reentrant) return false;
          const magics = [...new Set(magicsOf(payload))].filter((m): m is NodeStore => this.needsFlag(scheme, m));
          if (magics.length === 0) return false;
          this.reentrant = true;
          try {
            this.runGrouped(scheme, () => {
              for (const magic of magics) {
                scheme.commands.dispatchCommand(CMD_SET_META, {
                  id: magic.id,
                  meta: { ...magic.meta, handEdited: true },
                });
              }
              scheme.commands.dispatchCommand(command, payload);
            });
          } finally {
            this.reentrant = false;
          }
          return true;
        },
        4,
      );
    };
    const above = (id: string) => this.magicAbove(scheme, id, false);
    intercept(CMD_INSERT_NODE, ({ parentId }) => [this.magicAbove(scheme, parentId, true)]);
    intercept(CMD_DELETE_NODE, ({ id }) => {
      const node = scheme.nodes.getNodeSafe(id);
      const parent = node?.parent;
      // A node that is its parent's `out` is a change of that parent, not a child of it.
      return [parent && parent.out === node ? above(parent.id) : above(id)];
    });
    intercept(CMD_MOVE_NODES, ({ oldParentId, newParentId }) => [
      this.magicAbove(scheme, oldParentId, true),
      this.magicAbove(scheme, newParentId, true),
    ]);
    intercept(CMD_SET_DATA, ({ id }) => [above(id)]);
    intercept(CMD_SET_META, ({ id }) => [above(id)]);
    intercept(CMD_SET_OUT, ({ id }) => [above(id)]);
  }

  // --- context menu ------------------------------------------------------------------------------

  private registerContextMenu(scheme: Scheme) {
    if (!scheme.container.isRegistered(TOKEN_CONTEXT_MENU, true)) return;
    const contextMenu = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    contextMenu.registerBuilderForIcon(({ icon, builder }) => {
      if (icon.name !== MAGIC_NAME) return;
      const t = resolveService(TOKEN_I18N, scheme.container).t;
      const host = this.host(scheme);
      const node = scheme.nodes.getNodeSafe(icon.id);
      if (!node) return;
      const spell = readSpell(node);
      const items: { type: 'button'; text: string; onClick: () => void }[] = [];
      if (host) {
        items.push({ type: 'button', text: t('magic:menu.edit-steps'), onClick: () => host.openEditor(icon.id) });
        if (spell.trim()) {
          items.push({
            type: 'button',
            text: t('magic:menu.regenerate'),
            onClick: () => host.onSpellCommitted(icon.id, spell, spell),
          });
        }
      }
      if (this.canUnwrap(node)) {
        items.push({ type: 'button', text: t('magic:menu.unwrap'), onClick: () => this.unwrap(scheme, icon.id) });
      }
      if (items.length > 0) builder.addButtons({ group: 'root', items });
    });
  }

  /**
   * Unwrap needs a parent to move the steps to, and cannot carry the container's own `out` over (only a
   * few node kinds can have one, never `action` & co.), so a magic node with an `out` is not unwrappable.
   */
  private canUnwrap(node: NodeStore): boolean {
    return Boolean(node.parent) && node.out === null;
  }

  /** Moves the steps to the parent at the container's index and deletes the container — one undo step. */
  unwrap(scheme: Scheme, magicId: string): boolean {
    const magic = scheme.nodes.getNodeSafe(magicId);
    if (!magic || !this.canUnwrap(magic) || !magic.parent) return false;
    const parent = magic.parent;
    const index = parent.children.findIndex((child) => child.id === magicId);
    const length = magic.children.length;
    this.runGrouped(scheme, () => {
      if (length > 0) {
        scheme.commands.dispatchCommand(CMD_MOVE_NODES, {
          oldParentId: magicId,
          indexStart: 0,
          length,
          newParentId: parent.id,
          insertIndex: index,
        });
      }
      scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: magicId });
    });
    return true;
  }
}
