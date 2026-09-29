const setNestedValue = (target: Record<string, unknown>, path: readonly string[], value: string): void => {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    target[head] = value;
    return;
  }
  const child = (target[head] as Record<string, unknown> | undefined) ?? {};
  target[head] = child;
  setNestedValue(child, rest, value);
};

const BRACKET_SEGMENT_PATTERN = /\[([^\]]*)\]/g;

/** Splits a PHP-style bracket-notation key like `data[FIELDS][ID]` into `['data', 'FIELDS', 'ID']`; a plain key like `event` is returned as-is. */
const splitBracketKey = (key: string): readonly string[] => {
  const bracketStart = key.indexOf('[');
  if (bracketStart === -1) return [key];
  const base = key.slice(0, bracketStart);
  const segments = [...key.slice(bracketStart).matchAll(BRACKET_SEGMENT_PATTERN)].map((match) => match[1]);
  return [base, ...segments];
};

/**
 * Bitrix24's outgoing-webhook POST body is `application/x-www-form-urlencoded` with PHP-style
 * bracket-notation nesting (e.g. `data[FIELDS][ID]=123&auth[application_token]=abc`) — the Web
 * `URLSearchParams` API only decodes the flat key/value pairs, so this rebuilds the nested shape
 * (`{ data: { FIELDS: { ID: '123' } }, auth: { application_token: 'abc' } }`) the way PHP's own
 * `parse_str` would on the sending side. See ADR 0017 (private)'s Bitrix24 implementation notes.
 */
export const parseBracketFormBody = (body: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of new URLSearchParams(body).entries()) {
    setNestedValue(result, splitBracketKey(key), value);
  }
  return result;
};
