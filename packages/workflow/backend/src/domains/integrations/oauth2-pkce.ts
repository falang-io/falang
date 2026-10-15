import { createHash, randomBytes } from 'node:crypto';

export interface IPkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

/** RFC 7636 §4.2: `plain` sends the verifier itself, `S256` sends `BASE64URL(SHA256(verifier))`. */
export const computePkceChallenge = (verifier: string, method: 'plain' | 'S256'): string =>
  method === 'plain' ? verifier : createHash('sha256').update(verifier).digest('base64url');

/** RFC 7636 PKCE pair for the OAuth2 authorization-code flow's `code_challenge`/`code_verifier`. */
export const buildPkcePair = (method: 'plain' | 'S256'): IPkcePair => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: computePkceChallenge(verifier, method) };
};
