import { canonicalStringify } from './canonical-stringify.js';

/** One changed field, dotted-path addressed (`data.foo.bar`, `meta.someFlag`). Arrays are leaves — one entry for the whole array when any element differs. */
export interface IFieldChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const collectFieldChanges = (path: string, oldValue: unknown, newValue: unknown, out: IFieldChange[]): void => {
  if (isPlainObject(oldValue) && isPlainObject(newValue)) {
    const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
    for (const key of keys) {
      collectFieldChanges(`${path}.${key}`, oldValue[key], newValue[key], out);
    }
    return;
  }
  if (canonicalStringify(oldValue) !== canonicalStringify(newValue)) {
    out.push({ path, oldValue, newValue });
  }
};

/**
 * Leaf-level field-path diff: recurses into plain objects, treats arrays (and anything else) as
 * leaves. Shared by `diffNodeTrees` (`data`/`meta`) and `diffSnapshots` (a `custom` document's
 * `data`) — see ADR 0025 (private).
 */
export const diffFieldPaths = (prefix: string, oldValue: unknown, newValue: unknown): IFieldChange[] => {
  const out: IFieldChange[] = [];
  collectFieldChanges(prefix, oldValue, newValue, out);
  return out;
};
