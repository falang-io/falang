import type { INode, NodesStack } from '@falang/dto';
import { getAllowedChildNames } from '@falang/mcp-core';

const ID_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

/** A nanoid-shaped 21-character id, without a `nanoid` dependency (Web Crypto exists in browsers and Node alike). */
export const createNodeId = (): string => {
  const bytes = new Uint8Array(21);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => ID_ALPHABET[byte % 64]).join('');
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const has = (node: Record<string, unknown>, key: string): boolean => key in node && (node[key] ?? null) !== null;

export interface IStructureContext {
  readonly stack: NodesStack;
  readonly oldById: ReadonlyMap<string, INode>;
  /** id → the path that took it, to report duplicates. */
  readonly usedIds: Map<string, string>;
  readonly createId: () => string;
  readonly isListed: (kind: string) => boolean;
  newIds: number;
}

const listAllowed = (names: readonly string[], ctx: IStructureContext): string => {
  const listed = names.filter((name) => ctx.isListed(name));
  return listed.length > 0 ? listed.join(', ') : '(none)';
};

const nameOf = (value: unknown): unknown => (isRecord(value) ? value.name : null);

/** Checks one raw child list against the parent's children policy; returns an error or null. */
const checkChildren = (
  parent: string,
  children: readonly unknown[],
  path: string,
  ctx: IStructureContext,
): string | null => {
  const cfg = ctx.stack.getConfig(parent);
  if (cfg.childTuple) {
    const tuple = cfg.childTuple;
    const names = children.map((child) => nameOf(child));
    if (names.length !== tuple.length || names.some((name, i) => name !== tuple[i])) {
      return `${path}.children: "${parent}" must have exactly [${tuple.join(', ')}] in this order, got [${names.join(', ')}]. Statements go into a slot's own "children".`;
    }
    return null;
  }
  if (cfg.children !== true && !Array.isArray(cfg.children)) {
    return children.length > 0 ? `${path}: "${parent}" has no children.` : null;
  }
  const allowed = new Set(getAllowedChildNames(parent, ctx.stack));
  // An unknown kind is reported by the child itself ("unknown node kind"), not as a policy violation.
  const badIndex = children.findIndex((child) => {
    const name = nameOf(child);
    return typeof name === 'string' && ctx.stack.configsMap.has(name) && !allowed.has(name);
  });
  if (badIndex === -1) return null;
  const allowedText = listAllowed([...allowed], ctx);
  return `${path}.children[${badIndex}]: "${String(nameOf(children[badIndex]))}" is not allowed inside "${parent}". Allowed: ${allowedText}.`;
};

/**
 * The node's id: an id the old tree had for the same kind is kept; the root and a fixed-tuple slot written without a
 * known id take the old node's; anything else gets a fresh one. Returns an error for a duplicate.
 */
const assignId = (
  raw: Record<string, unknown>,
  path: string,
  oldNode: INode | null,
  isSlot: boolean,
  ctx: IStructureContext,
): string | null => {
  const name = raw.name as string;
  const rawId = typeof raw.id === 'string' && raw.id.length > 0 ? raw.id : null;
  const inheritsOld = oldNode !== null && oldNode.name === name && (isSlot || path === 'root');
  let id = rawId && ctx.oldById.get(rawId)?.name === name ? rawId : null;
  if (!id && inheritsOld && (!rawId || !ctx.oldById.has(rawId))) id = oldNode.id;
  if (!id) {
    id = ctx.createId();
    ctx.newIds += 1;
  }
  const previous = ctx.usedIds.get(id);
  if (previous) {
    return `${path}: duplicate node id "${id}" (also at ${previous}). Every node needs its own id — drop "id" on a copied node to get a new one.`;
  }
  ctx.usedIds.set(id, path);
  raw.id = id;
  return null;
};

/** Default `data` for a tuple slot written without it (e.g. `function-header`'s empty string). */
const fillSlotData = (raw: Record<string, unknown>, isSlot: boolean, ctx: IStructureContext): void => {
  const name = raw.name as string;
  if (isSlot && !has(raw, 'data') && ctx.stack.getConfig(name).data) raw.data = ctx.stack.factory(name).data;
};

const normalizeChildren = (
  raw: Record<string, unknown>,
  path: string,
  oldNode: INode | null,
  ctx: IStructureContext,
): string | null => {
  const name = raw.name as string;
  const cfg = ctx.stack.getConfig(name);
  if (!has(raw, 'children')) {
    if (cfg.childTuple) return `${path}: "${name}" must have "children" [${cfg.childTuple.join(', ')}].`;
    // A list-policy node written without "children" means an empty list (the validator wants the array).
    if (cfg.children === true || Array.isArray(cfg.children)) raw.children = [];
    return null;
  }
  if (!Array.isArray(raw.children)) return `${path}.children: expected an array.`;
  const policyError = checkChildren(name, raw.children, path, ctx);
  if (policyError) return policyError;
  const isSlot = Boolean(cfg.childTuple);
  for (const [i, child] of raw.children.entries()) {
    const oldChild = isSlot && oldNode?.name === name ? (oldNode.children?.[i] ?? null) : null;
    // oxlint-disable-next-line no-use-before-define -- mutual recursion
    const error = normalizeStructure(child, `${path}.children[${i}]`, oldChild, isSlot, ctx);
    if (error) return error;
  }
  return null;
};

const normalizeOutAndMods = (raw: Record<string, unknown>, path: string, ctx: IStructureContext): string | null => {
  const name = raw.name as string;
  if (has(raw, 'out')) {
    if (!ctx.stack.getConfig(name).haveOut) return `${path}: "${name}" can't have an "out".`;
    // oxlint-disable-next-line no-use-before-define -- mutual recursion
    const error = normalizeStructure(raw.out, `${path}.out`, null, false, ctx);
    if (error) return error;
  }
  const mods = Array.isArray(raw.mods) ? raw.mods : [];
  for (const [i, mod] of mods.entries()) {
    // oxlint-disable-next-line no-use-before-define -- mutual recursion
    const error = normalizeStructure(mod, `${path}.mods[${i}]`, null, false, ctx);
    if (error) return error;
  }
  return null;
};

/**
 * Step 2 of the write pipeline (ADR 0062 §2.2): structure + ids. Walks the raw parsed JSON, rejects unknown kinds,
 * children-policy violations and duplicate ids with a path, and assigns ids (`assignId`). Mutates `raw` in place (it is
 * the freshly parsed text, owned by the caller). Returns the first error, or null.
 */
export const normalizeStructure = (
  raw: unknown,
  path: string,
  oldNode: INode | null,
  isSlot: boolean,
  ctx: IStructureContext,
): string | null => {
  if (!isRecord(raw)) return `${path}: expected a node object.`;
  const { name } = raw;
  if (typeof name !== 'string') return `${path}: every node needs a string "name" (its kind).`;
  if (!ctx.stack.configsMap.has(name)) return `${path}: unknown node kind "${name}" — see NODES.md for the kinds.`;
  const idError = assignId(raw, path, oldNode, isSlot, ctx);
  if (idError) return idError;
  fillSlotData(raw, isSlot, ctx);
  return normalizeChildren(raw, path, oldNode, ctx) ?? normalizeOutAndMods(raw, path, ctx);
};

export const indexNodesById = (node: INode | null, map: Map<string, INode>): void => {
  if (!node) return;
  map.set(node.id, node);
  node.children?.forEach((child) => indexNodesById(child, map));
  node.mods?.forEach((mod) => indexNodesById(mod, map));
  indexNodesById(node.out ?? null, map);
};
