import { toJS } from 'mobx';
import type { INode, INodeMeta, NodesStack } from '@falang/dto';
import { getNodeStoreDto, type Scheme } from '@falang/scheme';

/** Node kind whose two `childTuple` slots are the "then"/"else" branches, ordered by `meta.trueOnRight`. */
export const IF_NODE_NAME = 'if';
/** Loop kind whose `meta.trueIsMain` negates its condition — the one meta key the agent sees (ADR 0062 §2.1). */
export const WHILE_NODE_NAME = 'while';

/** The meta keys a document file shows, per node kind — everything else in `meta` is layout and stays hidden. */
const VISIBLE_META: Readonly<Record<string, readonly string[]>> = { [WHILE_NODE_NAME]: ['trueIsMain'] };

export const visibleMetaKeys = (kind: string): readonly string[] => VISIBLE_META[kind] ?? [];

/** Whether a stored `if` keeps its "then" branch in slot 1 (`meta.trueOnRight === true`; absent = slot 0). */
export const isThenOnRight = (node: INode): boolean => node.meta?.trueOnRight === true;

const pickMeta = (node: INode): INodeMeta | null => {
  const keys = visibleMetaKeys(node.name);
  if (!node.meta || keys.length === 0) return null;
  // Only set flags are shown — an absent key reads as `false`, which is what the compilers default to.
  const picked = Object.fromEntries(keys.filter((key) => node.meta?.[key] === true).map((key) => [key, true]));
  return Object.keys(picked).length > 0 ? picked : null;
};

/** The kind's factory default for `data` — what a never-edited node of that kind carries. */
const defaultDataOf = (kind: string, stack: NodesStack): { data: unknown } | null => {
  try {
    const node = stack.factory(kind);
    return 'data' in node ? { data: node.data } : null;
  } catch {
    return null;
  }
};

/** Whether `kind` holds a free list of children (`children: true` or a named list) rather than fixed slots. */
export const hasListChildren = (kind: string, stack: NodesStack): boolean => {
  const policy = stack.configsMap.get(kind)?.children;
  return policy === true || Array.isArray(policy);
};

/** `node` with every `data` the serializer dropped (`getNodeStoreDto` omits a falsy one) filled back from the kind's
 *  default — the stored tree as the stack's own validator expects it. Meta and child order untouched. */
export const fillDroppedData = (node: INode, stack: NodesStack): INode => {
  const cfg = stack.configsMap.get(node.name);
  const filled = !('data' in node) && cfg?.data ? defaultDataOf(node.name, stack) : null;
  // A list-policy node serialized without children had an empty list (the validator wants the array).
  const children = node.children ?? (hasListChildren(node.name, stack) ? [] : null);
  return {
    ...node,
    ...filled,
    ...(children ? { children: children.map((child) => fillDroppedData(child, stack)) } : {}),
    ...(node.mods ? { mods: node.mods.map((mod) => fillDroppedData(mod, stack)) } : {}),
    ...(node.out ? { out: fillDroppedData(node.out, stack) } : {}),
  };
};

/** A live scheme's tree as plain data (meta defaults folded in by `getNodeStoreDto`, dropped data filled back). */
export const readSchemeTree = (scheme: Scheme): INode | null =>
  scheme.rootNode
    ? fillDroppedData(toJS(getNodeStoreDto(scheme.rootNode, scheme)) as INode, scheme.infra.structure)
    : null;

const project = (node: INode): INode => {
  let children = node.children?.map((child) => project(child));
  if (node.name === IF_NODE_NAME && children?.length === 2 && isThenOnRight(node))
    children = [children[1], children[0]];
  const meta = pickMeta(node);
  return {
    id: node.id,
    name: node.name,
    ...('data' in node ? { data: node.data } : {}),
    ...(meta ? { meta } : {}),
    ...(children ? { children } : {}),
    ...(node.mods && node.mods.length > 0 ? { mods: node.mods.map((mod) => project(mod)) } : {}),
    ...(node.out ? { out: project(node.out) } : {}),
  };
};

/**
 * The agent's view of a stored tree (ADR 0062 §2.1): no `meta` (layout noise) except the per-kind visible keys, every
 * `data`/empty list the serializer dropped filled back (`fillDroppedData`), and every `if`'s branches in *semantic*
 * order — slot 0 is always the "then" branch, whatever side the editor draws it on. `prepareDocumentWrite` maps it back.
 */
export const projectNodeTree = (node: INode, stack: NodesStack): INode => project(fillDroppedData(node, stack));

/** Canonical file text: 2-space pretty JSON with a trailing newline — stable, so `edit_file` substrings stay exact. */
export const renderDocumentJson = (root: INode, stack: NodesStack): string =>
  `${JSON.stringify(projectNodeTree(root, stack), null, 2)}\n`;
