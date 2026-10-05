// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import type { INode } from '@falang/dto';
import { withOut } from './projector.js';

/**
 * Whitespace-insensitive form of node data: strings collapse whitespace and drop a trailing `;`, objects get sorted
 * keys, and "nothing" values (`undefined`, `null`, `''`, `[]`, a `void` return type) are dropped — the tree stores
 * all of those interchangeably for "not set".
 */
export const normalizeData = (value: unknown, key?: string): unknown => {
  if (typeof value === 'string') return value.replaceAll(/\s+/g, ' ').trim().replace(/;$/, '').trim();
  if (Array.isArray(value)) return value.map((item) => normalizeData(item));
  if (value && typeof value === 'object') {
    if (key === 'returnValue' && (value as { type?: unknown }).type === 'void') return undefined;
    const out: Record<string, unknown> = {};
    for (const entryKey of Object.keys(value).toSorted()) {
      const normalized = normalizeData((value as Record<string, unknown>)[entryKey], entryKey);
      if (normalized === undefined || normalized === null || normalized === '') continue;
      if (Array.isArray(normalized) && normalized.length === 0) continue;
      if (entryKey === 'constant' && normalized === false) continue;
      if (entryKey === 'optional' && normalized === false) continue;
      out[entryKey] = normalized;
    }
    return out;
  }
  return value;
};

const emptyToUndefined = (value: unknown): unknown =>
  value === '' ||
  value === null ||
  (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0)
    ? undefined
    : value;

export const dataEquals = (a: unknown, b: unknown): boolean =>
  JSON.stringify(emptyToUndefined(normalizeData(a))) === JSON.stringify(emptyToUndefined(normalizeData(b)));

const outLevelOf = (node: INode): number => (typeof node.meta?.outLevel === 'number' ? node.meta.outLevel : 1);

/** Effective `while` condition and `if` branch order: the semantic content of `meta.trueIsMain`/`meta.trueOnRight`. */
const negate = (text: string): string => `!(${text})`;

/**
 * A node tree with ids, layout meta and the editor-only distinctions removed: a container's `out` is just its last
 * statement, `if` branches are in then/else order, `while`'s condition is the effective one. Two trees with the same
 * canonical form compile to the same code. Used by the round-trip tests (G1) and the matcher's deep hash.
 */
export const canonicalize = (node: INode): unknown => {
  const outLevel = outLevelOf(node);
  let children = withOut(node);
  let data = normalizeData(node.data);
  if (node.name === 'if' && node.meta?.trueOnRight === true) children = [...children].toReversed();
  if (node.name === 'while' && node.meta?.trueIsMain === true && typeof data === 'string') data = negate(data);
  return {
    name: node.name,
    ...(data === undefined || data === '' || (typeof data === 'object' && data && Object.keys(data).length === 0)
      ? {}
      : { data }),
    ...(outLevel > 1 ? { outLevel } : {}),
    ...(children.length > 0 ? { children: children.map((child) => canonicalize(child)) } : {}),
    ...(node.mods && node.mods.length > 0 ? { mods: node.mods.map((mod) => canonicalize(mod)) } : {}),
  };
};

export const canonicalKey = (node: INode): string => JSON.stringify(canonicalize(node));

/** Every node id in a tree (children, out, mods). */
export const collectIds = (node: INode, into = new Set<string>()): Set<string> => {
  into.add(node.id);
  for (const child of node.children ?? []) collectIds(child, into);
  for (const mod of node.mods ?? []) collectIds(mod, into);
  if (node.out) collectIds(node.out, into);
  return into;
};
