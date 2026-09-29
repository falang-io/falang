/**
 * Orders a set of `{ id; parentId }` items so a parent always precedes its children — used by
 * `restore-reconciliation.ts` both directly (folders to create: a parent must exist before a child
 * can reference it) and reversed via `.toReversed()` (folders to delete: a child must be gone, or
 * moved elsewhere, before its parent can be removed — see ADR 0025 (private),
 * "folders reconciled ... parents before children on create, children before parents on delete").
 *
 * An item's `parentId` pointing outside this same list (e.g. a folder being created whose parent
 * already exists in the DB, or a folder being deleted whose parent survives the restore untouched)
 * is treated as already resolved — only intra-list dependencies constrain the order. Defensive
 * against a cyclic/unresolvable `parentId` within the list (shouldn't happen for a snapshot this
 * same service produced): the unresolved remainder is appended as-is rather than looping forever.
 */
export const orderFoldersParentFirst = <T extends { id: string; parentId: string | null }>(
  items: readonly T[],
): T[] => {
  const idsInList = new Set(items.map((item) => item.id));
  const placed = new Set<string>();
  const result: T[] = [];
  let remaining = [...items];

  while (remaining.length > 0) {
    const resolvable = remaining.filter(
      (item) => item.parentId === null || !idsInList.has(item.parentId) || placed.has(item.parentId),
    );
    if (resolvable.length === 0) {
      result.push(...remaining);
      break;
    }
    result.push(...resolvable);
    for (const item of resolvable) placed.add(item.id);
    const resolvedNow = new Set(resolvable.map((item) => item.id));
    remaining = remaining.filter((item) => !resolvedNow.has(item.id));
  }

  return result;
};
