/**
 * Deterministic JSON serialization: object keys sorted recursively, arrays kept in order,
 * `undefined` object properties dropped (as `JSON.stringify` does), no whitespace. Used for content
 * addressing (`@falang/workflow-backend`'s `project_blobs`, hashed with `sha256` outside this
 * package) and for dirtiness/deep-equality checks by both `IVersionStore` implementations and by
 * `diffNodeTrees`/`diffSnapshots` in this package. See ADR 0025 (private).
 */
export const canonicalStringify = (value: unknown): string => {
  const type = typeof value;
  if (type === 'undefined' || value === null) {
    // Matches `JSON.stringify`'s own handling of `undefined` inside arrays/objects (rendered as
    // `null`); at the top level `JSON.stringify(undefined)` returns the real `undefined` value
    // rather than a string, which isn't usable for content addressing — `'null'` keeps this
    // function total and deterministic in every position.
    return 'null';
  }
  if (type === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (type === 'boolean' || type === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  if (type === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => {
        const valueType = typeof record[key];
        return valueType !== 'undefined';
      })
      .toSorted();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')}}`;
  }
  // functions, symbols, bigint — not representable in JSON; fall back to `null` rather than
  // throwing, since a stray non-JSON value in a `data`/`meta` field shouldn't crash a diff/hash.
  return 'null';
};
