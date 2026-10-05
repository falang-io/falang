import type { INode } from '@falang/dto';

/** What a write changed, by node id — the response to `write_file`/`edit_file` instead of the whole tree back. */
export interface ITreeChanges {
  readonly added: number;
  readonly removed: number;
  readonly modified: number;
  /** Up to a few `kind id` labels per category, so a dropped subtree is visible to the agent. */
  readonly sample: { readonly added: string[]; readonly removed: string[]; readonly modified: string[] };
}

const SAMPLE_SIZE = 8;

const flatten = (
  node: INode | null,
  parentId: string | null,
  out: Map<string, { node: INode; parentId: string | null; index: number }>,
  index = 0,
): void => {
  if (!node) return;
  out.set(node.id, { index, node, parentId });
  node.children?.forEach((child, i) => flatten(child, node.id, out, i));
  node.mods?.forEach((mod, i) => flatten(mod, node.id, out, i));
  if (node.out) flatten(node.out, node.id, out);
};

const label = (node: INode): string => `${node.name} ${node.id}`;

const sameData = (a: INode, b: INode): boolean => JSON.stringify(a.data ?? null) === JSON.stringify(b.data ?? null);

/** Added/removed/modified (data changed or moved to another parent) node counts between two trees. */
export const describeTreeChanges = (oldRoot: INode | null, newRoot: INode): ITreeChanges => {
  const before = new Map<string, { node: INode; parentId: string | null; index: number }>();
  const after = new Map<string, { node: INode; parentId: string | null; index: number }>();
  flatten(oldRoot, null, before);
  flatten(newRoot, null, after);
  const added = [...after.values()].filter(({ node }) => !before.has(node.id)).map(({ node }) => label(node));
  const removed = [...before.values()].filter(({ node }) => !after.has(node.id)).map(({ node }) => label(node));
  const modified = [...after.values()]
    .filter(({ node, parentId }) => {
      const old = before.get(node.id);
      return Boolean(old) && (!sameData(old?.node as INode, node) || old?.parentId !== parentId);
    })
    .map(({ node }) => label(node));
  return {
    added: added.length,
    modified: modified.length,
    removed: removed.length,
    sample: {
      added: added.slice(0, SAMPLE_SIZE),
      modified: modified.slice(0, SAMPLE_SIZE),
      removed: removed.slice(0, SAMPLE_SIZE),
    },
  };
};
