/** Segments that would reach `Object.prototype` through a plain assignment — dropped, never stored (security audit P0-3, ADR 0044 (private)). */
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** Hard caps so an unauthenticated body can't make the parser do unbounded work. */
const MAX_PAIRS = 1000;
const MAX_DEPTH = 8;

const isPlainContainer = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const setNestedValue = (target: Record<string, unknown>, path: readonly string[], value: string): void => {
  const [head, ...rest] = path;
  if (rest.length === 0) {
    target[head] = value;
    return;
  }
  const existing = target[head];
  const child = isPlainContainer(existing) ? existing : (Object.create(null) as Record<string, unknown>);
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
  const result = Object.create(null) as Record<string, unknown>;
  let pairs = 0;
  for (const [key, value] of new URLSearchParams(body).entries()) {
    pairs += 1;
    if (pairs > MAX_PAIRS) break;
    const path = splitBracketKey(key);
    if (path.length > MAX_DEPTH || path.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) continue;
    setNestedValue(result, path, value);
  }
  return result;
};

/** The flat key under which Bitrix24 sends its verification token. */
const APPLICATION_TOKEN_KEY = 'auth[application_token]';

/**
 * Extracts only `auth[application_token]` from the raw body — no nested structure is built, so the
 * verification step can run (and reject) before any attacker-controlled nesting is parsed at all.
 * `undefined` when absent.
 */
export const readApplicationToken = (body: string): string | undefined => {
  for (const [key, value] of new URLSearchParams(body).entries()) {
    if (key === APPLICATION_TOKEN_KEY) return value;
  }
};

/**
 * Constant-time string equality (no `node:crypto` import on purpose: this file is reachable from the
 * browser bundle through the package barrel). Length differences are folded into the accumulator
 * instead of returning early.
 */
export const safeEqual = (left: string, right: string): boolean => {
  // oxlint-disable no-bitwise -- bitwise accumulation is what makes the comparison constant-time.
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left.codePointAt(index) ?? 0) ^ (right.codePointAt(index) ?? 0);
  }
  // oxlint-enable no-bitwise
  return diff === 0;
};
