import { timingSafeEqual } from 'node:crypto';

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Compare against a same-length buffer on mismatch so timing does not depend on the guess length.
  const lengthsMatch = left.length === right.length;
  const equal = timingSafeEqual(left, lengthsMatch ? right : left);
  return lengthsMatch && equal;
};

/** Extracts the token from `Bearer <token>` or `Basic base64(<user>:<token>)`; null if absent/malformed. */
export const extractToken = (header: string | undefined): string | null => {
  if (!header) {
    return null;
  }
  const match = /^\s*(Bearer|Basic)\s+(\S+)\s*$/i.exec(header);
  if (!match) {
    return null;
  }
  const scheme = match[1].toLowerCase();
  if (scheme === 'bearer') {
    return match[2];
  }
  const decoded = Buffer.from(match[2], 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  return colon === -1 ? null : decoded.slice(colon + 1);
};

export const isAuthorized = (header: string | undefined, tokens: readonly string[]): boolean => {
  const token = extractToken(header);
  if (token === null) {
    return false;
  }
  let ok = false;
  for (const candidate of tokens) {
    if (safeEqual(token, candidate)) {
      ok = true;
    }
  }
  return ok;
};

export const parseTokens = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
