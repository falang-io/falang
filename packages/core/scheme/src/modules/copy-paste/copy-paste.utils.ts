import type { INode, NodesStack } from '@falang/dto';

const ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';
const ID_LENGTH = 21;

/**
 * A nanoid-compatible id (21 url-safe chars, the same shape `@falang/dto`'s factories produce). Uses
 * `crypto.getRandomValues`, which, unlike `crypto.randomUUID`, also works outside a secure context.
 */
export const generateNodeId = (): string => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(ID_LENGTH));
  let id = '';
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
};

/**
 * A deep copy of `node` where the node itself and every node below it (children, mods, out) gets a fresh id.
 * `data`/`meta` are deep-copied as they are — no node kind stores node ids there.
 */
export const cloneWithNewIds = (node: INode, createId: () => string = generateNodeId): INode => {
  const { children, mods, out, data, meta, ...rest } = node;
  return {
    ...rest,
    id: createId(),
    ...('data' in node ? { data: structuredClone(data) } : {}),
    ...(meta ? { meta: structuredClone(meta) } : {}),
    ...(children ? { children: children.map((child) => cloneWithNewIds(child, createId)) } : {}),
    ...(mods ? { mods: mods.map((mod) => cloneWithNewIds(mod, createId)) } : {}),
    ...(out ? { out: cloneWithNewIds(out, createId) } : {}),
  };
};

interface IStructuralNames {
  /** Kinds that only exist as a fixed tuple slot (`function-header`, `if-child`). */
  readonly slots: ReadonlySet<string>;
  /** Kinds listed by name in some parent's `children` array (`switch-option`, a mind-tree child). */
  readonly listed: ReadonlySet<string>;
  /** Whether the stack has any free-standing statement kind at all. */
  readonly hasStatements: boolean;
}

const cache = new WeakMap<NodesStack, IStructuralNames>();

const getStructuralNames = (stack: NodesStack): IStructuralNames => {
  const cached = cache.get(stack);
  if (cached) return cached;
  const slots = new Set<string>();
  const listed = new Set<string>();
  for (const cfg of stack.configsMap.values()) {
    for (const name of cfg.childTuple ?? []) slots.add(name);
    if (Array.isArray(cfg.children)) for (const name of cfg.children) listed.add(name);
  }
  const hasStatements = [...stack.configsMap.values()].some(
    (cfg) =>
      !cfg.documentRootOnly && !stack.modKindNames.has(cfg.name) && !slots.has(cfg.name) && !listed.has(cfg.name),
  );
  const names = { slots, listed, hasStatements };
  cache.set(stack, names);
  return names;
};

/**
 * Whether a `childName` node may be inserted into `parentName`'s children list. Mirrors `@falang/mcp-core`'s
 * `getAllowedChildNames` (which `@falang/scheme` can't depend on): a named list allows exactly its names; a
 * `children: true` body allows statements only — never a document root, a mod, an excluded kind or a structural
 * kind (a tuple slot, or a kind some parent lists by name), except a listed kind under itself in a stack without
 * any statement kinds (a mind-tree child). A fixed tuple accepts nothing.
 */
export const isAllowedChild = (stack: NodesStack, parentName: string, childName: string): boolean => {
  const parent = stack.configsMap.get(parentName);
  const child = stack.configsMap.get(childName);
  if (!parent?.children || !child) return false;
  if (Array.isArray(parent.children)) return parent.children.includes(childName);
  if (child.documentRootOnly || stack.modKindNames.has(childName) || parent.excludeChildren?.includes(childName)) {
    return false;
  }
  const { slots, listed, hasStatements } = getStructuralNames(stack);
  if (slots.has(childName)) return false;
  if (!listed.has(childName)) return true;
  return !hasStatements && childName === parentName;
};
