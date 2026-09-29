export type TToolExecutionResult = { ok: true; content: string } | { ok: false; error: string };

export const ok = (content: string): TToolExecutionResult => ({ content, ok: true });

// Narrower than `TToolExecutionResult` on purpose — `{ ok: false; error }` is also the failure variant of
// insert_nodes' own internal result types (see insert-nodes.ts), so this one helper satisfies both without
// a cast.
export const fail = (error: string): { ok: false; error: string } => ({ error, ok: false });

export const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;

export const formatZodIssues = (issues: readonly { message: string; path: readonly PropertyKey[] }[]): string =>
  issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ');

/**
 * Some models, mid-run, start sending an object-valued argument (`insert_nodes`' `node`, an object-shaped
 * `data`) as a string containing that object's JSON — seen live on 2026-09-27, 7 failed calls in a row
 * (`node.name is required`, `expected object, received string`) until the model gave up on the node kind
 * entirely. The intent is unambiguous, so it's decoded instead of bounced back: a string whose trimmed
 * text starts with `{`/`[` and parses as JSON becomes that value; anything else is returned unchanged.
 */
export const decodeJsonString = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
};

/** `asRecord`, accepting a JSON-encoded object string too — see `decodeJsonString`. */
export const asRecordLenient = (input: unknown): Record<string, unknown> | null => asRecord(decodeJsonString(input));

/**
 * `schema.safeParse(data)`, retried on the `decodeJsonString`-decoded value only when the raw value fails
 * — so a kind whose data really is a string (e.g. an `action`'s code, even one starting with `{`) is
 * never reinterpreted. On a double failure the original value's error is reported.
 */
export const safeParseLenient = <TResult extends { success: boolean }>(
  schema: { safeParse: (data: unknown) => TResult },
  data: unknown,
): TResult => {
  const first = schema.safeParse(data);
  if (first.success) return first;
  const decoded = decodeJsonString(data);
  if (decoded === data) return first;
  const second = schema.safeParse(decoded);
  return second.success ? second : first;
};
