/** `JSON.stringify` with object keys sorted — equality of plain data regardless of key order (zod re-orders keys to its
 *  schema's order on parse, which must not count as a change). */
export const stableStringify = (value: unknown): string =>
  JSON.stringify(value ?? null, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner as Record<string, unknown>).toSorted(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
