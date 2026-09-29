/**
 * A dropdown prop's value is stored in the same `CodeModelStore` every other prop uses (a raw JS
 * expression string fed straight into `getData()`'s `propsValue`), encoded as a JSON literal so no
 * downstream (compiler, `getData()`) needs to change — see `ActivepiecesActionEditorStore`.
 */

export const toOptionKey = (value: unknown): string => JSON.stringify(value);

/** `undefined` (shows as unset) for empty text or text that isn't a JSON literal (e.g. a pre-existing hand-written expression). */
export const decodeDropdownValue = (raw: string): string | undefined => {
  const trimmed = raw.trim();
  if (!trimmed) return;
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    // not a JSON literal (e.g. a pre-existing hand-written expression) — fall through to `undefined`.
  }
};

/** `[]` for empty text, a non-array JSON value, or text that isn't valid JSON at all. */
export const decodeMultiDropdownValue = (raw: string): string[] => {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed.map((item) => JSON.stringify(item)) : [];
  } catch {
    return [];
  }
};

export const encodeMultiDropdownValue = (keys: readonly string[]): string => `[${keys.join(',')}]`;
