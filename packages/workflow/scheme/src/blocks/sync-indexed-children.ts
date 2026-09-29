import { CMD_DELETE_NODE, CMD_INSERT_NODE, CMD_SET_DATA, type Scheme } from '@falang/scheme';

/**
 * Diffs `items` against `parentId`'s current children of kind `childNodeName` **by index only** and
 * issues the minimal set of commands to make the children match — shared by `QuestionEditorStore`
 * and `ChoiceEditorStore` (both back a header node whose sidebar edits a list that must stay in sync
 * with `<name>-option` children, see ADR 0002 (private) for why index-based diffing is intentional):
 *
 * - A changed value at a shared index is an in-place `CMD_SET_DATA` — never touches that child's own
 *   children/branch.
 * - Growth only ever appends at the tail (a brand-new node with an empty branch).
 * - Shrinkage only ever removes from the tail (the exact branch being removed, never a different one).
 *
 * Deliberately doesn't support arbitrary mid-list insert/delete/reorder — a child node's *children*
 * (its downstream branch) travel with it regardless of `data`, so a free-form reorder/mid-delete
 * would need identity-based (not index-based) diffing to avoid silently reassigning one item's
 * branch to a different one. Append/truncate-at-tail plus in-place edits never has that problem.
 *
 * Called from a `BlockEditorStore.getData()` override — safe to run exactly once per save, since
 * `EditorService.stopEdit` only calls `getData()` when the sidebar's save actually commits, before
 * disposing the store.
 */
export const syncIndexedChildren = <TItem>(
  scheme: Scheme,
  parentId: string,
  childNodeName: string,
  items: readonly TItem[],
  buildData: (item: TItem) => unknown,
): void => {
  const children = [...scheme.nodes.getNode(parentId).children];

  items.forEach((item, index) => {
    const data = buildData(item);
    const existing = children[index];
    if (existing) {
      if (JSON.stringify(existing.data) !== JSON.stringify(data)) {
        scheme.commands.dispatchCommand(CMD_SET_DATA, { id: existing.id, data });
      }
      return;
    }
    const node = scheme.infra.structure.factory(childNodeName);
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { parentId, index, node });
    scheme.commands.dispatchCommand(CMD_SET_DATA, { id: node.id, data });
  });

  children.slice(items.length).forEach((extra) => {
    scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id: extra.id });
  });
};
