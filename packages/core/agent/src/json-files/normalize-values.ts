import type { INode, INodeMeta, NodesStack } from '@falang/dto';
import { IF_NODE_NAME, isThenOnRight, visibleMetaKeys } from './project-node-tree.js';
import { normalizeTemplateBody, templateFieldsOfKind } from './template-fields.js';
import { isRecord } from './normalize-structure.js';

/** Step 3 of the write pipeline (ADR 0062 §2.2): the normalisations the agent should not have to know. */

export const walkRaw = (node: Record<string, unknown>, fn: (node: Record<string, unknown>) => void): void => {
  fn(node);
  if (Array.isArray(node.children)) for (const child of node.children) if (isRecord(child)) walkRaw(child, fn);
  if (Array.isArray(node.mods)) for (const mod of node.mods) if (isRecord(mod)) walkRaw(mod, fn);
  if (isRecord(node.out)) walkRaw(node.out, fn);
};

/** Template-literal fields (ADR 0062 §3): stray surrounding backticks stripped, a literal `\\n` in the text made a line break. */
export const normalizeTemplateFields = (node: Record<string, unknown>, stack: NodesStack): void => {
  const fields = templateFieldsOfKind(node.name as string, stack);
  if (fields.whole) {
    if (typeof node.data === 'string') node.data = normalizeTemplateBody(node.data);
    return;
  }
  if (fields.properties.length === 0 || !isRecord(node.data)) return;
  for (const field of fields.properties) {
    const value = node.data[field];
    if (typeof value === 'string') node.data[field] = normalizeTemplateBody(value);
  }
};

/**
 * Takes `meta` off a written node (layout stays ours, ADR 0062 §2.1) and records the visible keys it set — every
 * visible key, `false` when absent, since the file shows a set flag explicitly and dropping it means "unset".
 */
export const takeVisibleMeta = (node: Record<string, unknown>, out: Map<string, INodeMeta>): void => {
  const keys = visibleMetaKeys(node.name as string);
  const meta = isRecord(node.meta) ? node.meta : {};
  if (keys.length > 0) out.set(node.id as string, Object.fromEntries(keys.map((key) => [key, meta[key] === true])));
  delete node.meta;
};

/**
 * Maps every `if` from the file's semantic order (slot 0 = "then") back to stored order, keeping the old node's side
 * unless that would put a branch with an `out` first (ADR 0035's rule) — then the branches are swapped and the side
 * flipped, as the converter's `fixIfFirstBranchOut` does. Returns the `trueOnRight` each `if` must end up with.
 */
export const orientIfs = (
  node: Record<string, unknown>,
  oldById: ReadonlyMap<string, INode>,
  out: Map<string, boolean>,
): void => {
  const children = Array.isArray(node.children) ? (node.children as Record<string, unknown>[]) : [];
  if (node.name === IF_NODE_NAME && children.length === 2) {
    const [thenBranch, elseBranch] = children;
    const old = oldById.get(node.id as string);
    let onRight = old ? isThenOnRight(old) : false;
    const first = onRight ? elseBranch : thenBranch;
    const second = onRight ? thenBranch : elseBranch;
    if (first.out && !second.out) onRight = !onRight;
    node.children = onRight ? [elseBranch, thenBranch] : [thenBranch, elseBranch];
    out.set(node.id as string, onRight);
  }
  for (const child of children) orientIfs(child, oldById, out);
  if (isRecord(node.out)) orientIfs(node.out, oldById, out);
};

/** Merges the meta the file decides (visible keys, each `if`'s side) over whatever `preserveMeta` restored. */
export const applyMetaOverlay = (node: INode, overlay: ReadonlyMap<string, INodeMeta>): INode => {
  const extra = overlay.get(node.id);
  // Every overlaid flag defaults to `false`: a `false` for a key the node doesn't carry changes nothing, so it isn't
  // written (an absent key and `false` compile the same; writing it would be a spurious meta edit).
  const changes = Object.entries(extra ?? {}).filter(
    ([key, value]) => value !== false || (node.meta && key in node.meta),
  );
  const meta = changes.length > 0 ? { ...node.meta, ...Object.fromEntries(changes) } : node.meta;
  return {
    ...node,
    ...(meta ? { meta } : {}),
    ...(node.children ? { children: node.children.map((child) => applyMetaOverlay(child, overlay)) } : {}),
    ...(node.mods ? { mods: node.mods.map((mod) => applyMetaOverlay(mod, overlay)) } : {}),
    ...(node.out ? { out: applyMetaOverlay(node.out, overlay) } : {}),
  };
};
