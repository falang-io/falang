import { toJS } from 'mobx';
import type { INode } from '@falang/dto';
import { resolveService } from '@falang/di';
import {
  CMD_DELETE_NODE,
  CMD_INSERT_NODE,
  CMD_SET_DATA,
  CMD_SET_META,
  CMD_SET_OUT,
  TOKEN_HISTORY,
  type NodeStore,
  type Scheme,
} from '@falang/scheme';

type TOp = () => void;

interface IPlan {
  readonly deletes: TOp[];
  readonly updates: TOp[];
  readonly inserts: TOp[];
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const plainData = (store: NodeStore): unknown => toJS(store.data);

/**
 * Plans the commands turning one list (`children` or `mods`) of a kept node into `next`. Same ids in the same order →
 * recurse into each pair; otherwise every old entry is deleted and every new one inserted whole (ids and meta ride
 * along in the inserted `INode`, so identity and layout survive a reorder or a move).
 */
const planList = (
  scheme: Scheme,
  parent: NodeStore,
  current: readonly NodeStore[],
  next: readonly INode[],
  slot: 'children' | 'mods',
  plan: IPlan,
): void => {
  const sameShape =
    current.length === next.length &&
    current.every((store, i) => store.id === next[i].id && store.name === next[i].name);
  if (sameShape) {
    // oxlint-disable-next-line no-use-before-define -- mutual recursion
    current.forEach((store, i) => planNode(scheme, store, next[i], plan));
    return;
  }
  for (const store of current) {
    const { id } = store;
    plan.deletes.push(() => scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id }));
  }
  next.forEach((node, index) => {
    plan.inserts.push(() =>
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index, node, parentId: parent.id, slot }),
    );
  });
};

const planNode = (scheme: Scheme, store: NodeStore, next: INode, plan: IPlan): void => {
  const { id } = store;
  if (!same(plainData(store), next.data)) {
    const data = next.data;
    plan.updates.push(() => scheme.commands.dispatchCommand(CMD_SET_DATA, { data, id }));
  }
  if (!same(toJS(store.meta), next.meta) && next.meta) {
    const meta = next.meta;
    plan.updates.push(() => scheme.commands.dispatchCommand(CMD_SET_META, { id, meta }));
  }
  planList(scheme, store, store.children, next.children ?? [], 'children', plan);
  planList(scheme, store, store.mods, next.mods ?? [], 'mods', plan);
  const currentOut = store.out;
  const nextOut = next.out ?? null;
  if (currentOut && nextOut && currentOut.id === nextOut.id && currentOut.name === nextOut.name) {
    planNode(scheme, currentOut, nextOut, plan);
  } else if (currentOut || nextOut) {
    if (currentOut) plan.deletes.push(() => scheme.commands.dispatchCommand(CMD_SET_OUT, { id, outNode: null }));
    if (nextOut) plan.inserts.push(() => scheme.commands.dispatchCommand(CMD_SET_OUT, { id, outNode: nextOut }));
  }
};

/**
 * Replaces a live `Scheme`'s tree with `nextRoot` (already validated, ids matched — `prepareDocumentWrite`'s output)
 * through the ordinary command bus, as ONE undo group (ADR 0062 §2.2 step 5): data/meta edits, then every delete, then
 * every insert — deletes first so a node moved to another parent never exists twice. Delete + insert instead of a new
 * "replace subtree" command: history, read-only guards, autosave sync and the version diff all work unchanged. On a
 * failure mid-way the group is undone and the error rethrown, so the scheme is never left half-applied.
 */
export const applyTreeToScheme = (scheme: Scheme, nextRoot: INode): void => {
  const root = scheme.rootNode;
  if (!root) throw new Error('applyTreeToScheme: the scheme has no root');
  if (root.id !== nextRoot.id || root.name !== nextRoot.name) {
    throw new Error(`applyTreeToScheme: root mismatch (${root.name} ${root.id} vs ${nextRoot.name} ${nextRoot.id})`);
  }
  const plan: IPlan = { deletes: [], inserts: [], updates: [] };
  planNode(scheme, root, nextRoot, plan);
  const ops = [...plan.updates, ...plan.deletes, ...plan.inserts];
  if (ops.length === 0) return;
  const history = resolveService(TOKEN_HISTORY, scheme.container);
  history.beginGroup();
  let applied = 0;
  try {
    for (const op of ops) {
      op();
      applied += 1;
    }
  } catch (error) {
    history.endGroup();
    // Only undo when something of this group was recorded — otherwise `back()` would undo an unrelated earlier edit.
    if (applied > 0) history.back();
    throw error;
  }
  history.endGroup();
};
